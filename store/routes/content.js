'use strict';
var P = require('bluebird')
var Busboy = require('busboy')
var fs = require('graceful-fs')
var mime = require('mime')
var mkdirp = require('mkdirp-then')
var path = require('path')
var promisePipe = require('promisepipe')
var temp = require('temp')

var NotFoundError = require('../../helpers/NotFoundError')
var sha1File = require('../../helpers/sha1FileNew')
var SHA1Stream = require('../../helpers/SHA1Stream')
var UserError = require('../../helpers/UserError')

var config = require('../../config')

//make some promises
P.promisifyAll(fs)


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
    var tmpfile = temp.path({prefix: 'oose-' + config.prism.name})
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
    filePromises.push(
      promisePipe(file,sniff,writeStream)
        .then(function(){
          files[key].sha1 = sniff.sha1
          files[key].file = sha1FileNew.toPath(
            sniff.sha1,
            mime.extension(files[key].mimetype)
          )
        })
    )
  })
  busboy.on('finish',function(){
    P.all(filePromises)
      .then(function(){
        //process files
        var promises = []
        var fk = Object.keys(files)
        var rename = function(file){
          fs.renameAsync(file.tmpfile,file.file)
        }
        var file
        for(var i = 0; i < fk.length; i++){
          file = files[fk[i]]
          promises.push(
            mkdirp(path.dirname(file.file))
              .then(rename(file))
          )
        }
        return P.all(promises)
      })
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
 * Download content
 * @param {object} req
 * @param {object} res
 */
exports.download = function(req,res){
  sha1FileNew.find(req.body.sha1)
    .then(function(file){
      if(!file) throw new NotFoundError('File not found')
      if(file instanceof Array) throw new UserError('SHA1 is ambiguous')
      res.sendFile(file)
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
 * Content exists
 * @param {object} req
 * @param {object} res
 */
exports.exists = function(req,res){
  sha1FileNew.find(req.body.sha1)
    .then(function(file){
      var exists = false
      if(file) exists = true
      res.json({exists: !!exists})
    })
}


/**
 * Content remove
 * @param {object} req
 * @param {object} res
 */
exports.remove = function(req,res){
  sha1FileNew.find(req.body.sha1)
    .then(function(file){
      if(!file) throw new NotFoundError('File not found')
      if(file instanceof Array) throw new UserError('SHA1 is ambiguous')
      return fs.unlinkAsync(file)
    })
    .then(function(){
      res.json({success: 'File removed'})
    })
    .catch(NotFoundError,function(err){
      res.status(404)
      res.json({error: err.message})
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}
