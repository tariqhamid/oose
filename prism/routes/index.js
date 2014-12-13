'use strict';
var P = require('bluebird')
var Busboy = require('busboy')
var fs = require('graceful-fs')
var promisePipe = require('promisepipe')
var temp = require('temp')

var APIClient = require('../../helpers/APIClient')
var SHA1Stream = require('../../helpers/SHA1Stream')
var UserError = require('../../helpers/UserError')

var config = require('../../config')

var master = new APIClient(config.master.port,config.master.host)
master.setBasicAuth(config.master.username,config.master.password)

//make some promises
P.promisifyAll(temp)


/**
 * Homepage
 * @param {object} req
 * @param {object} res
 */
exports.index = function(req,res){
  res.json({message: 'Welcome to OOSE version ' + config.version})
}


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
        return master.post('/user/session/validate',{
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
 * User routes
 * @type {object}
 */
exports.user = require('./user')
