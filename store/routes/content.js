'use strict';
var P = require('bluebird')
var fs = require('graceful-fs')
var mkdirp = require('mkdirp-then')
var path = require('path')
var promisePipe = require('promisepipe')

var NotFoundError = require('../../helpers/NotFoundError')
var sha1File = require('../../helpers/sha1File')
var SHA1Stream = require('../../helpers/SHA1Stream')
var UserError = require('../../helpers/UserError')

//make some promises
P.promisifyAll(fs)


/**
 * Upload file
 * @param {object} req
 * @param {object} res
 */
exports.upload = function(req,res){
  var file = req.params.file
  var fileDetails
  var sniff = new SHA1Stream()
  var dest
  sha1File.details(file)
    .then(function(result){
      if(!result) throw new UserError('Could not parse filename')
      fileDetails = result
      dest = sha1File.toPath(fileDetails.sha1,fileDetails.ext)
      return mkdirp(path.dirname(dest))
    })
    .then(function(){
      var writeStream = fs.createWriteStream(dest)
      return promisePipe(req,sniff,writeStream)
    })
    .then(function(){
      if(sniff.sha1 !== fileDetails.sha1){
        fs.unlinkSync(dest)
        throw new UserError('Checksum mismatch')
      }
      res.status(201)
      res.json({sha1: sniff.sha1})
    })
    .catch(UserError,function(err){
      res.status(500)
      res.json({error: err})
    })
}


/**
 * Download content
 * @param {object} req
 * @param {object} res
 */
exports.download = function(req,res){
  sha1File.find(req.body.sha1)
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
  sha1File.find(req.body.sha1)
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
  sha1File.find(req.body.sha1)
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
