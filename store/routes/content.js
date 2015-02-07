'use strict';
var P = require('bluebird')
var fs = require('graceful-fs')
var mkdirp = require('mkdirp-then')
var oose = require('oose-sdk')
var path = require('path')
var promisePipe = require('promisepipe')
var sha1stream = require('sha1-stream')

var NotFoundError = oose.NotFoundError
var sha1File = require('../../helpers/sha1File')
var UserError = oose.UserError

//make some promises
P.promisifyAll(fs)


/**
 * Put file
 * @param {object} req
 * @param {object} res
 */
exports.put = function(req,res){
  var file = req.params.file
  var fileDetails
  var sniff = sha1stream.createStream()
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
        .then(
          function(val){return val},
          function(err){throw new UserError(err.message)}
        )
    })
    .then(function(){
      if(sniff.sha1 !== fileDetails.sha1){
        fs.unlinkSync(dest)
        throw new UserError('Checksum mismatch')
      }
      //setup symlink to new file
      return sha1File.linkPath(fileDetails.sha1,fileDetails.ext)
    })

    .then(function(){
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
  var sha1 = req.body.sha1
  var singular = !(sha1 instanceof Array)
  if(singular) sha1 = [sha1]
  var promises = []
  for(var i = 0; i < sha1.length; i++){
    promises.push(sha1File.find(sha1[i]))
  }
  P.all(promises)
    .then(function(result){
      var exists = {}
      for(var i = 0; i < sha1.length; i++){
        exists[sha1[i]] = !!result[i]
      }
      if(singular){
        res.json({exists: exists[sha1[0]]})
      } else {
        res.json(exists)
      }
    })
}


/**
 * Content remove
 * @param {object} req
 * @param {object} res
 */
exports.remove = function(req,res){
  sha1File.remove(req.body.sha1)
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
