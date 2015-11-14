'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:store:content')
var fs = require('graceful-fs')
var mime = require('mime')
var mkdirp = require('mkdirp-then')
var oose = require('oose-sdk')
var path = require('path')
var promisePipe = require('promisepipe')
var sha1stream = require('sha1-stream')

var api = require('../../helpers/api')
var cradle = require('../../helpers/couchdb')
var redis = require('../../helpers/redis')
var sha1File = require('../../helpers/sha1File')

var config = require('../../config')

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
  debug('got new put',file)
  var sniff = sha1stream.createStream()
  var inventoryKey
  sniff.on('data',function(chunk){
    redis.incrby(
      redis.schema.counter('store','content:bytesUploaded'),chunk.length)
  })
  var dest
  sha1File.details(file)
    .then(function(result){
      if(!result) throw new UserError('Could not parse filename')
      fileDetails = result
      inventoryKey = cradle.schema.inventory(fileDetails.sha1,config.store.name)
      dest = sha1File.toPath(fileDetails.sha1,fileDetails.ext)
      debug(fileDetails.sha1,dest)
      return mkdirp(path.dirname(dest))
    })
    .then(function(){
      debug(inventoryKey,'waiting for stream to complete')
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
      debug(inventoryKey,'linking')
      return sha1File.linkPath(fileDetails.sha1,fileDetails.ext)
    })
    .then(function(){
      //get existing existence record and add to it or create one
      debug(inventoryKey,'getting inventory record')
      return cradle.db.getAsync(inventoryKey)
    })
    .then(
      //record exists, extend it
      function(doc){
        debug(inventoryKey,'got inventory record',doc)
      },
      //record does not exist, create it
      function(err){
        if(404 !== err.headers.status) throw err
        var inventory = {
          prism: config.store.prism,
          store: config.store.name,
          sha1: sniff.sha1,
          mimeExtension: fileDetails.ext,
          mimeType: mime.lookup(fileDetails.ext),
          relativePath: sha1File.toRelativePath(
            fileDetails.sha1,fileDetails.ext
          )
        }
        debug(inventoryKey,'creating inventory record',inventory)
        return cradle.db.saveAsync(inventoryKey,inventory)
      }
    )
    .then(function(){
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
  var inventoryKey = cradle.schema.inventory(req.body.sha1,config.store.name)
  P.all([
    sha1File.remove(req.body.sha1),
    cradle.db.removeAsync(inventoryKey)
  ])
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
  var storeKey = cradle.schema.store(req.body.store)
  var storeClient = null
  var store = {}
  var details = {}
  cradle.db.getAsync(storeKey)
    .then(
      function(result){
        store = result
        storeClient = api.store(store)
      },
      function(err){
        if(404 !== err.headers.status) throw err
        throw new Error('Store not found')
      }
    )
    .then(function(){
      return sha1File.details(file)
    })
    .then(function(result){
      details = result
      var rs = fs.createReadStream(sha1File.toPath(details.sha1,details.ext))
      return promisePipe(
        rs,
        storeClient.put({url: storeClient.url('/content/put/' + file)})
      )
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
