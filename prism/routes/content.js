'use strict';
var P = require('bluebird')
var Busboy = require('busboy')
var fs = require('graceful-fs')
var promisePipe = require('promisepipe')
var temp = require('temp')

var api = require('../../helpers/api')
var sha1File = require('../../helpers/sha1File')
var SHA1Stream = require('../../helpers/SHA1Stream')
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
    files[key] = {
      key: key,
      tmpfile: tmpfile,
      name: name,
      encoding: encoding,
      mimetype: mimetype,
      sha1: null
    }
    filePromises.push(promisePipe(file,sniff,writeStream)
      .then(function(){
        files[key].sha1 = sniff.sha1
      }))
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
        //process files
        res.json({success: 'File(s) uploaded',data: data,files: files})
      })
      .catch(UserError,function(err){
        res.json({error: err.message})
      })
  })
  req.pipe(busboy)
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
  res.json({error: 'Not implemented'})
}


/**
 * Check if content exists
 * @param {object} req
 * @param {object} res
 */
exports.exists = function(req,res){
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
      for(var i = 0; i < storeList.length; i++){
        store = storeList[i]
        promises.push(
          api.store(store).post('/content/exists',{sha1: sha1})
        )
      }
      return P.all(promises)
    })
    .then(function(results){
      var row
      for(var i = 0; i < results.length; i++){
        row = results[i]
        console.log(row)
      }
      res.json(results)
    })
}
