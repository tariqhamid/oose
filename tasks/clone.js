'use strict';
var file = require('../helpers/file')
  , redis = require('../helpers/redis')
  , net = require('net')
  , fs = require('fs')
  , async = require('async')
  , logger = require('../helpers/logger')
  , prettyBytes = require('pretty-bytes')
  , config = require('../config')


/**
 * Clone a file to another peer
 * @param {object} job
 * @param {function} cb
 */
var clone = function(job,cb){
  var done = function(err){
    if(err) logger.error('[Clone] ' + job.sha1 + ' failed to replicate: ' + err)
    cb(err)
  }
  if('function' !== typeof done) done = function(){}
  logger.info('[Clone] Starting to replicate ' + job.sha1)
  //track some stats
  var bytesSent = 0
  var start = new Date().getTime()
  //i need to ask mesh for the peerNext
  redis.hgetall('peerNext',function(err,peer){
    if(err) return done(err)
    if(!peer || peer.hostname === config.get('hostname')) return done('Could not find suitable peer')
    var rs = fs.createReadStream(file.pathFromSha1(job.sha1))
    var ws = net.connect(peer.port,peer.ip)
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
      var bytesPerSec = prettyBytes(bytesSent / duration) + '/sec'
      logger.info(
        '[Clone] Finished replicating ' + job.sha1 +
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
