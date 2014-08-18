'use strict';
var file = require('../helpers/file')
  , redis = require('../helpers/redis')
  , net = require('net')
  , fs = require('fs')
  , async = require('async')
  , logger = require('../helpers/logger').create('task:fileClone')
  , prettyBytes = require('pretty-bytes')
  , config = require('../config')


/**
 * Clone a file to another peer
 * @param {object} job
 * @param {function} cb
 */
var clone = function(job,cb){
  var done = function(err){
    if(err) logger.error(job.sha1 + ' failed to replicate: ' + err)
    cb(err)
  }
  if('function' !== typeof done) done = function(){}
  logger.info('Starting to replicate ' + job.sha1)
  //track some stats
  var bytesSent = 0
  var start = new Date().getTime()
  //i need to ask mesh for the peerNext
  redis.hgetall('peer:next',function(err,result){
    if(err) return done(err)
    //select a peer from the result
    var peer
    for(var k in result){
      if(!result.hasOwnProperty(k)) continue
      if(k === config.get('hostname')) continue
      peer = JSON.parse(result[k])
      break
    }
    if(!peer) return done('Could not locate an available peer to accept the clone')
    //setup streams
    var rs = fs.createReadStream(file.pathFromSha1(job.sha1))
    var ws = net.connect(peer.portImport,peer.ip)
    ws.on('connect',function(){
      rs.pipe(ws)
    })
    rs.on('data',function(data){
      bytesSent += data.length
    })
    rs.on('error',done)
    ws.on('error',done)
    rs.on('close',function(){
      var duration = (new Date().getTime() - start) / 1000
      var bytesPerSec = prettyBytes((bytesSent || 0 / duration || 1) || 0) + '/sec'
      logger.info(
        'Finished replicating ' + job.sha1 +
        ' to ' + peer.hostname + '.' + peer.domain +
        ' in ' + duration + ' seconds ' +
        'averaging ' + bytesPerSec)
      done()
    })
  })

}

var q = async.queue(clone,require('os').cpus().length)


/**
 * Export clone queue
 * @type {AsyncQueue<T>}
 */
module.exports = q
