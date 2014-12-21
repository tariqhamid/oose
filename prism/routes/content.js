'use strict';
var P = require('bluebird')
var Busboy = require('busboy')
var fs = require('graceful-fs')
var mime = require('mime')
var promisePipe = require('promisepipe')
var temp = require('temp')

var api = require('../../helpers/api')
var NetworkError = require('../../helpers/NetworkError')
var NotFoundError = require('../../helpers/NotFoundError')
var prismBalance = require('../../helpers/prismBalance')
var promiseWhile = require('../../helpers/promiseWhile')
var purchasePath = require('../../helpers/purchasePath')
var redis = require('../../helpers/redis')
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
          //do a content lookup and see if this exists yet
          return prismBalance.contentExists(sniff.sha1)
        }).then(function(result){
          if(!result.exists && 0 === result.count){
            //actually stream the file to new peers
            return prismBalance.prismList()//pick first winner
              .then(function(result){
                prismList = result
                return prismBalance.winner('newFile',prismList)
              })//pick second winner
              .then(function(result){
                if(!result){
                  throw new UserError('Failed to find a prism ' +
                    'instance to upload to')
                }
                winners.push(result)
                return prismBalance.winner('newFile',prismList,[result.name])
              })//stream the file to winners
              .then(function(result){
                if(result) winners.push(result)
                var readStream = fs.createReadStream(tmpfile)
                var promises = []
                for(var i = 0; i < winners.length; i++){
                  promises.push(promisePipe(readStream,api.prism(winners[i])
                    .put('/content/put/' + files[key].sha1 +
                    '.' + files[key].ext)))
                }
                return P.all(promises)
              })
          } else {
            //file already exists on cluster so we are done
          }
        })
    )
  })
  busboy.on('finish',function(){
    P.all(filePromises)
      .then(function(){
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
    return prismBalance.prismList()
  })
    .then(function(result){
      prismList = result
      var promises = []
      var prism
      var checkExistence = function(prism){
        return api.prism(prism).post('/content/existsLocal',{sha1: sha1})
          .spread(function(res,body){
            return {prism: prism.name, exists: body}
          })
          .catch(NetworkError,function(){
            return {
              prism: prism.name,
              exists: {
                exists: false,
                count: 0,
                map: {}
              }
            }
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
    return prismBalance.storeListByPrism(config.prism.name)
  })
    .then(function(result){
      storeList = result
      var promises = []
      var store
      var checkExistence = function(store){
        return api.store(store).post('/content/exists',{sha1: sha1})
          .spread(function(res,body){
            return {store: store.name, exists: body.exists}
          })
          .catch(NetworkError,function(){
            return {store: store.name, exists: false}
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


/**
 * Download purchased content
 * @param {object} req
 * @param {object} res
 */
exports.download = function(req,res){
  var sha1 = req.body.sha1
  var winner, exists
  prismBalance.contentExists(sha1)
    .then(function(result){
      exists = result
      if(!exists && !exists.exists)
        throw new NotFoundError('File not found')
      return storeBalance.winnerFromExists(sha1,exists)
    })
    .then(function(result){
      winner = result
      var store = api.store(winner)
      return store.post('/ping')
        .then(function(){
          store.download('/content/download',{sha1: sha1}).pipe(res)
        })
    })
    .catch(NetworkError,function(){
      return storeBalance.winnerFromExists(sha1,exists,[winner.name])
        .then(function(result){
          winner = result
          var store = api.store(winner)
          return store.post('/ping')
            .then(function(){
              store.download('/content/download',{sha1: sha1}).pipe(res)
            })
        })
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
 * Purchase content
 * @param {object} req
 * @param {object} res
 */
exports.purchase = function(req,res){
  var ip = req.body.ip || req.ip || '127.0.0.1'
  var sha1 = req.body.sha1
  var life = req.body.life || 21600 //6hrs
  var token, map, purchase
  P.try(function(){
    if(!sha1File.validate(sha1))
      throw new UserError('Invalid SHA1 passed for purchase')
    return prismBalance.contentExists(sha1)
  })
    .then(function(result){
      map = result
      if(!map.exists) throw new NotFoundError('File not found')
      //really right here we need to generate a unique token (unique meaning
      //not already in the redis registry for purchases since we already have
      //a token then we should just try
      var tokenExists = true
      return promiseWhile(
        function(){
          return !!tokenExists
        },
        function(){
          token = purchasePath.generateToken()
          return redis.existsAsync(purchasePath.redisKey(token))
            .then(function(result){
              tokenExists = result
            })
        }
      )
    })
    .then(function(){
      //now we know our token so register it on the store instances
      //this means iterating the existence map
      return storeBalance.populateStores(storeBalance.existsToArray(map))
    })
    .then(function(stores){
      var createPurchase = function(store){
        var client = api.store(store)
        return client
          .post('/purchase/remove',{token: token})
          .spread(function(){
            return client.post('/purchase/create',{
              sha1: sha1,
              token: token,
              life: life
            })
          })
          .catch(NetworkError,function(){
            //nothing we can do
          })
      }
      var promises = []
      for(var i = 0; i < stores.length; i++){
        promises.push(createPurchase(stores[i]))
      }
      return P.all(promises)
        .then(function(results){
          var ext
          for(var i = 0; i < results.length; i++){
            if(!ext && results[i] && results[i][1] && results[i][1].ext){
              ext = results[i][1].ext
              break
            }
          }
          return ext
        })
    })
    .then(function(ext){
      //now create our purchase object
      purchase = {
        sha1: sha1,
        life: life,
        token: token,
        map: map,
        ext: ext,
        ip: ip
      }
      //okay so the purchase is registered on all our stores, time to register
      //it to all the prisms
      return prismBalance.prismList()
    })
    .then(function(result){
      var createPurchase = function(prism){
        var client = api.prism(prism)
        return client
          .post('/purchase/remove',{token: token})
          .spread(function(){
            return client.post('/purchase/create',{purchase: purchase})
          })
          .catch(NetworkError,function(){
            //nothing we can do
          })
      }
      var prismList = result
      var promises = []
      for(var i = 0; i < prismList.length; i++){
        promises.push(createPurchase(prismList[i]))
      }
      return P.all(promises)
    })
    .then(function(){
      res.json(purchase)
    })
    .catch(NotFoundError,function(err){
      res.status(404)
      res.json({error: err})
    })
    .catch(UserError,function(err){
      res.json({error: err})
    })
}


/**
 * Content delivery
 * @param {object} req
 * @param {object} res
 */
exports.deliver = function(req,res){
  var token = req.params.token
  var filename = req.params.filename
  var redisKey = purchasePath.redisKey(token)
  var purchase
  redis.getAsync(redisKey)
    .then(function(result){
      if(!result) throw new NotFoundError('Purchase not found')
      purchase = JSON.parse(result)
      if(purchase.ip !== req.ip) throw new UserError('Invalid IP')
      //we have a purchase so now... we need to pick a store....
      return storeBalance.winnerFromExists(token,purchase.map)
    })
    .then(function(result){
      var url = 'http://' + result.name + '.' + config.domain +
        '/' + token + '/' + filename
      res.redirect(302,url)
    })
    .catch(SyntaxError,function(err){
      res.status(500)
      res.json({error: 'Failed to parse purchase: ' + err.message})
    })
    .catch(NotFoundError,function(err){
      res.status(404)
      res.json({error: err.message})
    })
    .catch(UserError,function(err){
      res.status(500)
      res.json({error: err.message})
    })
}


/**
 * Remove purchase cluster wide
 * @param {object} req
 * @param {object} res
 */
exports.remove = function(req,res){
  var token = req.body.token
  var redisKey = purchasePath.redisKey(token)
  var prismList
  var purchase
  redis.getAsync(redisKey)
    .then(function(result){
      if(!result){
        res.json({token: token, count: 0, success: 'Purchase removed'})
      } else {
        purchase = JSON.parse(result)
        return storeBalance.populateStores(
          storeBalance.existsToArray(purchase.map)
        )
      }
    })
    .then(function(stores){
      var promises = []
      for(var i = 0; i < stores.length; i++){
        promises.push(
          api.store(stores[i]).post('/purchase/remove',{token: token})
        )
      }
      return P.all(promises)
    })
    .then(function(){
      return prismBalance.prismList()
    })
    .then(function(result){
      prismList = result
      var promises = []
      for(var i = 0; i < prismList.length; i++){
        promises.push(
          api.prism(prismList[i]).post('/purchase/remove',{token: token})
        )
      }
      return P.all(promises)
    })
    .then(function(){
      res.json({token: token, count: 1, success: 'Purchase removed'})
    })
}
