'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:store:inventory')
var fs = require('graceful-fs')
var infant = require('infant')
var mime = require('mime')
var path = require('path')
var prettyBytes = require('pretty-bytes')
var readdirp = require('readdirp')

var cradle = require('../helpers/couchdb')

var config = require('../config')

var interval

//make some promises
P.promisifyAll(fs)


/**
 * Scan Store Inventory
 * @param {function} done
 */
var scanInventory = function(done){
  var root = path.resolve(config.root)
  if(!fs.existsSync(root))
    throw new Error('Root folder does not exist')

  var contentFolder = path.resolve(root + '/content')

  if(!fs.existsSync(contentFolder))
    throw new Error('Content folder does not exist')


  /**
   * Stat counters
   * @type {{warning: number, error: number, removed: number, valid: number}}
   */
  var counter = {
    warning: 0,
    error: 0,
    invalid: 0,
    valid: 0,
    created: 0,
    updated: 0,
    bytes: 0,
    repaired: 0
  }
  debug('starting to scan',contentFolder)
  var stream = readdirp({root: contentFolder, fileFilter: '*.*'})
  stream.on('data',function(entry){
    debug('got a hit',entry)
    debug('pausing stream for processing')
    stream.pause()
    var filePath = entry.fullPath
    var relativePath = entry.path
    var linkPath = filePath.replace(/\..+$/,'')
    var stat = entry.stat
    counter.bytes += stat.size
    if(!fs.existsSync(linkPath)){
      counter.repaired++
      debug('repaired link path for',filePath)
      fs.symlinkSync(filePath,linkPath)
    }
    var ext = relativePath.match(/\.(.+)$/)[0]
    var sha1 = relativePath.replace(/[\\\/]/g,'').replace(/\..+$/,'')
    //skip invalid inventory entries
    if(!sha1.match(/^[a-f0-9]{40}$/i)){
      counter.invalid++
      debug(sha1,'invalid, resuming stream')
      stream.resume()
    }
    //otherwise try and insert them into inventory if they are not already
    //there
    else {
      counter.valid++
      debug(sha1,'inventory scan found',ext,relativePath,linkPath)
      //since nodes
      var inventoryKey = cradle.schema.inventory(sha1,config.store.name)
      cradle.db.getAsync(inventoryKey)
        .then(
          function(doc){
            debug(sha1,'inventory record exists',doc)
          },
          function(err){
            //make sure we only catch 404s and let others bubble
            if(404 !== err.headers.status) throw err
            var doc = {
              store: config.store.name,
              prism: config.store.prism,
              sha1: sha1,
              mimeExtension: ext,
              mimeType: mime.lookup(ext),
              relativePath: relativePath
            }
            debug(sha1,'creating inventory record',doc)
            counter.created++
            return cradle.db.saveAsync(inventoryKey,doc)
          }
        )
        .then(function(){
          debug(sha1,'inventory updated')
        })
        .catch(function(err){
          console.log(err.stack)
          console.log(err)
          console.log(sha1,'insertion FAILED',err.message)
        })
        .finally(function(){
          debug(sha1,'record scan complete, resuming stream')
          stream.resume()
        })
    }
  })
  stream.on('error',function(err){
    done(err)
  })
  stream.on('warn',function(err){
    console.log(err.stack)
    console.log('readdirp warning: ' + err.message)
  })
  stream.on('end',function(){
    done(null,counter)
  })
}

var scanInventoryAsync = P.promisify(scanInventory)


/**
 * Run the inventory scan
 */
var runInterval = function(){
  console.log('Starting to examine store inventory')
  scanInventoryAsync()
    .then(function(counter){
      console.log('Inventory scan complete')
      console.log('  ' +
        counter.valid + ' valid ' +
        prettyBytes(counter.bytes) + ' ' +
        counter.created + ' created ' +
        counter.updated + ' updated ' +
        counter.repaired + ' repaired ' +
        counter.invalid + ' invalid ' +
        counter.warning + ' warnings ' +
        counter.error + ' errors'
      )
    })
    .catch(function(err){
      console.log(err.stack)
      console.log('Inventory Scan Error: ' + err.message)
    })
}

if(require.main === module){
  infant.child(
    'oose:' + config.store.name + ':inventory',
    function(done){
      //setup the interval for collection from master
      debug('set inventory interval')
      interval = setInterval(runInterval,config.store.inventoryFrequency)
      //do initial scan at startup
      debug('doing initial inventory scan')
      runInterval()
      //return now as we do not want to wait on the first scan it can be
      //lengthy
      process.nextTick(done)
    },
    function(done){
      clearInterval(interval)
      debug('cleared inventory interval')
      process.nextTick(done)
    }
  )
}

