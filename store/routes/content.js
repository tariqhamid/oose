'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:store:content')
var devNullStream = require('dev-null')
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

var createInventory = function(fileDetail,verified){
  if('undefined' === typeof verified) verified = false
  var inventoryKey = cradle.schema.inventory(
    fileDetail.hash,
    config.store.prism,
    config.store.name
  )
  var inventory = {
    prism: config.store.prism,
    store: config.store.name,
    hash: fileDetail.hash,
    mimeExtension: fileDetail.ext,
    mimeType: mime.lookup(fileDetail.ext),
    relativePath: hashFile.toRelativePath(
      fileDetail.hash,fileDetail.ext
    ),
    size: fileDetail.stat.size
  }
  if(verified) inventory.verifiedAt = verified
  debug(inventoryKey,'creating inventory record',inventory)
  return cradle.inventory.saveAsync(inventoryKey,inventory)
    .then(function(result){
      inventory._rev = result.rev
      return inventory
    })
}

var updateInventory = function(fileDetail,doc,verified){
  if('undefined' === typeof verified) verified = false
  doc.mimeExtension = fileDetail.ext
  doc.mimeType = mime.lookup(fileDetail.ext)
  doc.relativePath = hashFile.toRelativePath(
    fileDetail.hash,fileDetail.ext
  )
  doc.size = fileDetail.stat.size
  if(verified) doc.verifiedAt = verified
  return cradle.inventory.saveAsync(doc._id,doc._rev,doc)
    .then(function(result){
      doc._rev = result.rev
      return doc
    })
}


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
  var fileDetail
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
      fileDetail = result
      inventoryKey = cradle.schema.inventory(
        fileDetail.hash,config.store.prism,config.store.name)
      dest = hashFile.toPath(fileDetail.hash,fileDetail.ext)
      debug(fileDetail.hash,dest)
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
      if(sniff.hash !== fileDetail.hash){
        fs.unlinkSync(dest)
        throw new UserError('Checksum mismatch')
      }
      //setup symlink to new file
      debug(inventoryKey,'linking')
      return hashFile.linkPath(fileDetail.hash,fileDetail.ext)
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
        return updateInventory(fileDetail,doc)
      },
      //record does not exist, create it
      function(err){
        if(!err || !err.headers || 404 !== err.headers.status) throw err
        return createInventory(fileDetail)
      }
    )
    .then(function(){
      res.status(201)
      res.json({hash: sniff.hash})
    })
    .catch(UserError,function(err){
      console.log('Failed to upload content',err.message,err.stack)
      fs.unlinkSync(dest)
      cradle.inventory.getAsync(inventoryKey)
        .then(function(result){
          return cradle.inventory.removeAsync(result._id,result._rev)
        })
        .catch(function(err){
          console.log('Failed to clean up broken inventory record',
            err.message,err.stack)
        })
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
          ext: !!result[i] ? path.extname(result[i]).replace('.','') : ''
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
    cradle.inventory.getAsync(inventoryKey)
      .then(function(result){
        return cradle.inventory.removeAsync(result._id,result._rev)
      })
      .catch(function(){
        //nothing
      })
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
 * Get detail about a hash
 * @param {object} req
 * @param {object} res
 */
exports.detail = function(req,res){
  var detail = {
    hash: '',
    mimeExtension: '.bin',
    mimeType: 'application/octet-stream',
    relativePath: '',
    prism: '',
    store: '',
    size: 0,
    hashDetail: {
      hash: '',
      ext: '',
      type: '',
      exists: false,
      stat: {
        dev: 0,
        mode: 0,
        nlink: 0,
        uid: 0,
        gid: 0,
        rdev: 0,
        blksize: 0,
        ino: 0,
        size: 0,
        blocks: 0,
        atime: null,
        mtime: null,
        ctime: null,
        birthtime: null
      }
    }
  }
  var hash = req.body.hash
  var inventoryKey = cradle.schema.inventory(
    hash,config.store.prism,config.store.name)
  cradle.inventory.getAsync(inventoryKey)
    .then(function(record){
      if(!record) throw new Error('File not found')
      detail.hash = record.hash
      detail.mimeExtension = record.mimeExtension
      detail.mimeType = record.mimeType
      detail.relativePath = record.relativePath
      detail.prism = record.prism
      detail.store = record.store
      return hashFile.details(
        record.hash + '.' + record.mimeExtension.replace('.',''))
    })
    .then(function(result){
      detail.hashDetail = result
      detail.size = detail.hashDetail.stat.size
      res.json(detail)
    })
    .catch(function(err){
      if('File not found' === err.message){
        res.status(404)
        res.json({error: 'File not status', code: 404})
      } else{
        res.status(500)
        res.json({error: 'An uknown error occurred',message: err.message})
        console.log(err.message,err.stack)
      }
    })
}


/**
 * Verify the integrity of a file, invalids are removed immediately
 * @param {object} req
 * @param {object} res
 */
exports.verify = function(req,res){
  var file = req.body.file
  var force = req.body.force || false
  var sniffStream = {}
  var fileDetail = {}
  var inventoryKey = ''
  var inventory = {}
  var verifySkipped = false
  var verifiedAt = +new Date()
  hashFile.details(file)
    .then(function(result){
      fileDetail = result
      inventoryKey = cradle.schema.inventory(
        fileDetail.hash,
        config.store.prism,
        config.store.name
      )
      return cradle.inventory.getAsync(inventoryKey)
        .catch(function(){})
    })
    .then(function(result){
      inventory = result
      //skip reading the file if possible
      if(!fileDetail.exists) return
      if(inventory && inventory.verifiedAt && false === force && (
        inventory.verifiedAt > (+new Date() - config.store.verifyExpiration)
      )){
        verifySkipped = true
        return
      }
      //at this point read the file and verify
      var readStream = fs.createReadStream(fileDetail.path)
      sniffStream = hashStream.createStream(fileDetail.type)
      var writeStream = devNullStream()
      return promisePipe(readStream,sniffStream,writeStream)
    })
    .then(function(){
      //validate the file, if it doesnt match remove it
      if(!fileDetail.exists){
        return cradle.inventory.getAsync(inventoryKey)
          .then(function(result){
            return cradle.inventory.removeAsync(result._id,result._rev)
          })
          .catch(function(err){
            if(!err || !err.headers || 404 !== err.headers.status){
              console.log('Failed to delete inventory record for missing file',
                err.message,err.stack)
            } else {
              throw new Error('File not found')
            }
          })
      } else if(!verifySkipped && sniffStream.hash !== fileDetail.hash){
        return hashFile.remove(fileDetail.hash)
          .then(function(){
            return cradle.inventory.removeAsync(inventory._id,inventory._rev)
          })
          .catch(function(){})
      } else if(!verifySkipped) {
        //here we should get the inventory record, update it or create it
        return cradle.inventory.getAsync(inventoryKey)
          .then(
            function(result){
              return updateInventory(fileDetail,result,verifiedAt)
            },
            //record does not exist, create it
            function(err){
              if(!err || !err.headers || 404 !== err.headers.status) throw err
              return createInventory(fileDetail,verifiedAt)
            }
          )
      }
    })
    .then(function(){
      res.json({
        success: 'Verification complete',
        status: verifySkipped ? 'ok' :
          (sniffStream.hash === fileDetail.hash ? 'ok' : 'fail'),
        expectedHash: fileDetail.hash,
        actualHash: verifySkipped ? fileDetail.hash : sniffStream.hash,
        verifySkipped: verifySkipped,
        verified: verifySkipped || sniffStream.hash === fileDetail.hash,
        verifiedAt: verifiedAt
      })
    })
    .catch(function(err){
      if('File not found' === err.message){
        res.status(404)
        res.json({
          error: 'File not found'
        })
      } else {
        console.log('File verification failed',err.message,err.stack)
        res.status(500)
        res.json({
          error: err.message,
          stack: err.stack
        })
      }
    })
}


/**
 * Content send (to another store)
 * @param {object} req
 * @param {object} res
 */
exports.send = function(req,res){
  var file = req.body.file
  var nameParts = req.body.store.split(':')
  var storeKey = cradle.schema.store(nameParts[0],nameParts[1])
  var storeClient = null
  var store = {}
  var details = {}
  cradle.peer.getAsync(storeKey)
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
    .catch(function(err){
      console.log(err.message,err.stack)
      res.json({
        error: 'Failed to send clone ' + err.message,
        err: err,
        stack: err.stack,
        file: file,
        store: store,
        details: details
      })
    })
}
