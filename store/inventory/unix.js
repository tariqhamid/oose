'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:store:inventory')
var cp = require('child_process')
var fs = require('graceful-fs')
var mime = require('mime')
var path = require('path')

var cradle = require('../../helpers/couchdb')

var config = require('../../config')

var execAsync = P.promisify(cp.exec)


/**
 * Scan Store Inventory
 *  This aims to be a much more efficient high performance native unix driver
 *  that will work much better in production environments. It will lean on the
 *  advantages of the unix file command and stream that output rather than using
 *  the node implementation of readdirp.
 * @param {function} done
 */
module.exports = function(done){
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
  execAsync(
    'find ' + contentFolder + ' -type f',
    {
      cwd: '/',
      maxBuffer: 4294967296
    }
  )
    .then(function(result){
      return result
        .split('\n')
        .filter(function(item){return '' !== item})
        .map(function(val){
          return path.resolve(val)
        })
    })
    .map(function(filePath){
      filePath = path.posix.resolve(filePath)
      debug('got a hit',filePath)
      var relativePath = path.posix.relative(contentFolder,filePath)
      var linkPath = filePath.replace(/\..+$/,'')
      var stat = fs.statSync(filePath)
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
      }
      //otherwise try and insert them into inventory if they are not already
      //there
      else {
        counter.valid++
        debug(sha1,'inventory scan found',ext,relativePath,linkPath)
        //since nodes
        var inventoryKey = cradle.schema.inventory(
          sha1,config.store.prism,config.store.name)
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
      }
    },config.store.inventoryConcurrency)
    .then(function(){
      done(null,counter)
    })
    .catch(function(err){
      done(err)
    })
}
