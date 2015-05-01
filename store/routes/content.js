'use strict';
var P = require('bluebird')
var fs = require('graceful-fs')
var mkdirp = require('mkdirp-then')
var oose = require('oose-sdk')
var path = require('path')
var promisePipe = require('promisepipe')
var sha1stream = require('sha1-stream')

var api = require('../../helpers/api')
var redis = require('../../helpers/redis')
var sha1File = require('../../helpers/sha1File')

var config = require('../../config')
var master = api.master()

var NotFoundError = oose.NotFoundError
var UserError = oose.UserError

//make some promises
P.promisifyAll(fs)


/**
 * Put file
 * @param {object} req
 * @param {object} res
 */
exports.put = function(req,res){
  redis.incr(redis.schema.counter('store','content:put'))
  redis.incr(redis.schema.counter('store','content:filesUploaded'))
  var file = req.params.file
  var fileDetails
  var sniff = sha1stream.createStream()
  sniff.on('data',function(chunk){
    redis.incrby(
      redis.schema.counter('store','content:bytesUploaded'),chunk.length)
  })
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
      //tell master about the new inventory record
      var inventory = {
        sha1: sniff.sha1,
        mimeExtension: fileDetails.ext,
        store: config.store.name
      }
      //console.log('content added, notifying master',inventory)
      return master.postAsync({
        url: master.url('/inventory/create'),
        json: inventory
      })
    })
    .spread(function(){
      res.status(201)
      res.json({sha1: sniff.sha1})
    })
    .catch(UserError,function(err){
      redis.incr(redis.schema.counterError('store','content:put'))
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
  redis.incr(redis.schema.counter('store','content:download'))
  sha1File.find(req.body.sha1)
    .then(function(file){
      if(!file) throw new NotFoundError('File not found')
      res.sendFile(file)
    })
    .catch(NotFoundError,function(err){
      redis.incr(redis.schema.counterError('store','content:download:notFound'))
      res.status(404)
      res.json({error: err.message})
    })
    .catch(UserError,function(err){
      redis.incr(redis.schema.counterError('store','content:download'))
      res.json({error: err.message})
    })
}


/**
 * Content exists
 * @param {object} req
 * @param {object} res
 */
exports.exists = function(req,res){
  redis.incr(redis.schema.counter('store','content:exists'))
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
        exists[sha1[i]] = {
          exists: !!result[i],
          ext: path.extname(result[i]).replace('.','')
        }
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
  redis.incr(redis.schema.counter('store','content:remove'))
  sha1File.remove(req.body.sha1)
    .then(function(){
      res.json({success: 'File removed'})
    })
    .catch(NotFoundError,function(err){
      redis.incr(redis.schema.counterError('store','content:remove:notFound'))
      res.status(404)
      res.json({error: err.message})
    })
    .catch(UserError,function(err){
      redis.incr(redis.schema.counterError('store','content:remove'))
      res.json({error: err.message})
    })
}


/**
 * Content send (to another store)
 * @param {object} req
 * @param {object} res
 */
exports.send = function(req,res){
  var file = req.body.file
  var store = api.store(req.body.store)
  var details = {}
  sha1File.details(file)
    .then(function(result){
      details = result
      var rs = fs.createReadStream(sha1File.toPath(details.sha1,details.ext))
      return promisePipe(rs,store.put({url: store.url('/content/put/' + file)}))
    })
    .then(function(){
      res.json({
        success: 'Clone sent',
        file: file,
        store: store,
        details: details
      })
    })
}
