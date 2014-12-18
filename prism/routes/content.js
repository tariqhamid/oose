'use strict';
var P = require('bluebird')
var Busboy = require('busboy')
var fs = require('graceful-fs')
var mime = require('mime')
var promisePipe = require('promisepipe')
var temp = require('temp')

var api = require('../../helpers/api')
var NotFoundError = require('../../helpers/NotFoundError')
var prismBalance = require('../../helpers/prismBalance')
var sha1File = require('../../helpers/sha1File')
var SHA1Stream = require('../../helpers/SHA1Stream')
var storeBalance = require('../../helpers/storeBalance')
var UserError = require('../../helpers/UserError')

var config = require('../../config')

//make some promises
P.promisifyAll(temp)


/**
 * Upload file
 * @param {object} req
 * @param {object} res
 */
exports.upload = function(req,res){
  var data = {}
  var files = {}
  var filePromises = []
  var busboy = new Busboy({
    headers: req.headers,
    highWaterMark: 65536, //64K
    limits: {
      fileSize: 2147483648000 //2TB
    }
  })
  busboy.on('field',function(key,value){
    data[key] = value
  })
  busboy.on('file',function(key,file,name,encoding,mimetype){
    var tmpfile = temp.path({prefix: 'oose:' + config.prism.name})
    var sniff = new SHA1Stream()
    var writeStream = fs.createWriteStream(tmpfile)
    var prismList
    var winners = []
    files[key] = {
      key: key,
      tmpfile: tmpfile,
      name: name,
      encoding: encoding,
      mimetype: mimetype,
      ext: mime.extension(mimetype),
      sha1: null
    }
    filePromises.push(
      promisePipe(file,sniff,writeStream)
        .then(function(){
          files[key].sha1 = sniff.sha1
          //here the file needs to be replicate to at least two prisms
          return api.master.post('/prism/list')
        })
        //pick first winner
        .spread(function(res,body){
          prismList = body.prism
          return prismBalance.winner(prismList)
        })
        //pick second winner
        .then(function(result){
          if(!result)
            throw new UserError('Failed to find a prism instance to upload to')
          winners.push(result)
          return prismBalance.winner(prismList,[result.name])
        })
        //stream the file to winners
        .then(function(result){
          if(result) winners.push(result)
          var readStream = fs.createReadStream(tmpfile)
          var winner
          var promises = []
          for(var i = 0; i < winners.length; i++){
            winner = winners[i]
            promises.push(promisePipe(
              readStream,
              api.prism(winner)
                .put('/content/put/' + files[key].sha1 + '.' + files[key].ext)
            ))
          }
          return P.all(promises)
        })
    )
  })
  busboy.on('finish',function(){
    P.all(filePromises)
      .then(function(){
        if(!data.token) throw new UserError('No token provided')
        return api.master.post('/user/session/validate',{
          token: data.token,
          ip: req.ip
        })
      })
      .spread(function(response,body){
        if('Session valid' !== body.success)
          throw new UserError('Invalid session')
        res.json({success: 'File(s) uploaded',data: data,files: files})
      })
      .catch(UserError,function(err){
        res.json({error: err.message})
      })
  })
  req.pipe(busboy)
}


/**
 * Put a file directly to a prism for distribution to a store
 * @param {object} req
 * @param {object} res
 */
exports.put = function(req,res){
  var file = req.params.file
  var storeList
  api.master.post('/store/list',{prism: config.prism.name})
    .spread(function(res,body){
      storeList = body.store
      return storeBalance.winner(storeList)
    })
    .then(function(result){
      if(!result) throw new UserError('No suitable store instance found')
      return promisePipe(req,api.store(result).put('/content/upload/' + file))
    })
    .then(function(){
      res.status(201)
      res.json({success: 'File uploaded', file: file})
    })
    .catch(UserError,function(err){
      res.status(500)
      res.json({error: err.message})
    })
}


/**
 * Purchase content
 * @param {object} req
 * @param {object} res
 */
exports.purchase = function(req,res){
  P.try(function(){
    var sha1 = req.body.sha1
    if(!sha1File.validate(sha1))
      throw new UserError('Invalid SHA1 passed for purchase')
  })
  res.json({error: 'Not implemented'})
}


/**
 * Download purchased content
 * @param {object} req
 * @param {object} res
 */
exports.download = function(req,res){
  var sha1 = req.body.sha1
  api.prism(config.prism).post('/content/exists',{sha1: sha1})
    .spread(function(res,body){
      if(!body.exists) throw new NotFoundError('File not found')
      return storeBalance.winnerFromExists(body)
    })
    .then(function(result){
      api.store(result).download('/content/download',{sha1: sha1}).pipe(res)
    })
    .catch(NotFoundError,function(err){
      res.status(404)
      res.json({error: err.message})
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Check for existence across the platform
 * @param {object} req
 * @param {object} res
 */
exports.exists = function(req,res){
  var prismList
  var sha1 = req.body.sha1
  P.try(function(){
    if(!sha1File.validate(sha1))
      throw new UserError('Invalid SHA1 passed for existence check')
    //get a list of store instances we own
    return api.master.post('/prism/list')
  })
    .spread(function(res,body){
      prismList = body.prism
      var promises = []
      var prism
      var checkExistence = function(prism){
        return api.prism(prism).post('/content/existsLocal',{sha1: sha1})
          .spread(function(res,body){
            return {prism: prism.name, exists: body}
          })
      }
      for(var i = 0; i < prismList.length; i++){
        prism = prismList[i]
        promises.push(checkExistence(prism))
      }
      return P.all(promises)
    })
    .then(function(results){
      var map = {}
      var exists = false
      var count = 0
      var row
      for(var i = 0; i < results.length; i++){
        row = results[i]
        if(row.exists.exists){
          exists = true
          count += row.exists.count
        }
        map[row.prism] = row.exists
      }
      res.json({sha1: sha1, exists: exists, count: count, map: map})
    })
}


/**
 * Check if content exists
 * @param {object} req
 * @param {object} res
 */
exports.existsLocal = function(req,res){
  var storeList
  var sha1 = req.body.sha1
  P.try(function(){
    if(!sha1File.validate(sha1))
      throw new UserError('Invalid SHA1 passed for existence check')
    //get a list of store instances we own
    return api.master.post('/store/list',{prism: config.prism.name})
  })
    .spread(function(res,body){
      storeList = body.store
      var promises = []
      var store
      var checkExistence = function(store){
        return api.store(store).post('/content/exists',{sha1: sha1})
          .spread(function(res,body){
            return {store: store.name, exists: body.exists}
          })
      }
      for(var i = 0; i < storeList.length; i++){
        store = storeList[i]
        promises.push(checkExistence(store))
      }
      return P.all(promises)
    })
    .then(function(results){
      var map = {}
      var exists = false
      var count = 0
      var row
      for(var i = 0; i < results.length; i++){
        row = results[i]
        if(row.exists){
          exists = true
          count++
        }
        map[row.store] = row.exists
      }
      res.json({exists: exists, count: count, map: map})
    })
}
