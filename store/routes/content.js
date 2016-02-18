'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:store:content')
var fs = require('graceful-fs')
var mime = require('mime')
var mkdirp = require('mkdirp-then')
var oose = require('oose-sdk')
var path = require('path')
var promisePipe = require('promisepipe')
var hashStream = require('sha1-stream')

var api = require('../../helpers/api')
var cradle = require('../../helpers/couchdb')
var redis = require('../../helpers/redis')
var hashFile = require('../../helpers/hashFile')

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
  var hashType = req.params.hashType || config.defaultHashType || 'sha1'
  var fileDetails
  debug('got new put',file)
  var sniff = hashStream.createStream(hashType)
  var inventoryKey
  sniff.on('data',function(chunk){
    redis.incrby(
      redis.schema.counter('store','content:bytesUploaded'),chunk.length)
  })
  var dest
  hashFile.details(file)
    .then(function(result){
      if(!result) throw new UserError('Could not parse filename')
      fileDetails = result
      inventoryKey = cradle.schema.inventory(
        fileDetails.hash,config.store.prism,config.store.name)
      dest = hashFile.toPath(fileDetails.hash,fileDetails.ext)
      debug(fileDetails.hash,dest)
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
      if(sniff.hash !== fileDetails.hash){
        fs.unlinkSync(dest)
        throw new UserError('Checksum mismatch')
      }
      //setup symlink to new file
      debug(inventoryKey,'linking')
      return hashFile.linkPath(fileDetails.hash,fileDetails.ext)
    })
    .then(function(){
      //get existing existence record and add to it or create one
      debug(inventoryKey,'getting inventory record')
      return cradle.inventory.getAsync(inventoryKey)
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
          hash: sniff.hash,
          mimeExtension: fileDetails.ext,
          mimeType: mime.lookup(fileDetails.ext),
          relativePath: hashFile.toRelativePath(
            fileDetails.hash,fileDetails.ext
          )
        }
        debug(inventoryKey,'creating inventory record',inventory)
        return cradle.inventory.saveAsync(inventoryKey,inventory)
      }
    )
    .then(function(){
      res.status(201)
      res.json({hash: sniff.hash})
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
  hashFile.find(req.body.hash)
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
  var hash = req.body.hash
  var singular = !(hash instanceof Array)
  if(singular) hash = [hash]
  var promises = []
  for(var i = 0; i < hash.length; i++){
    promises.push(hashFile.find(hash[i]))
  }
  P.all(promises)
    .then(function(result){
      var exists = {}
      for(var i = 0; i < hash.length; i++){
        exists[hash[i]] = {
          exists: !!result[i],
          ext: path.extname(result[i]).replace('.','')
        }
      }
      if(singular){
        res.json({exists: exists[hash[0]]})
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
  var inventoryKey = cradle.schema.inventory(
    req.body.hash,config.store.prism,config.store.name)
  P.all([
      hashFile.remove(req.body.hash),
      cradle.inventory.removeAsync(inventoryKey)
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
  cradle.inventory.getAsync(storeKey)
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
      return hashFile.details(file)
    })
    .then(function(result){
      details = result
      var rs = fs.createReadStream(hashFile.toPath(details.hash,details.ext))
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
