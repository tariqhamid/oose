'use strict';
var file = require('../helpers/file')
var peer = require('../helpers/peer')
var net = require('net')
var fs = require('graceful-fs')
var async = require('async')
var logger = require('../helpers/logger').create('task:fileClone')
var prettyBytes = require('pretty-bytes')
var config = require('../config')


/**
 * Clone a file to another peer
 * @param {object} job
 * @param {function} cb
 */
var clone = function(job,cb){
  if('function' !== typeof cb) cb = function(){}
  var done = function(err){
    if(err) logger.error(job.sha1 + ' failed to replicate: ' + err)
    cb(err)
  }
  //track some stats
  var winner
  var bytesSent = 0
  var start = new Date().valueOf()
  //start process
  async.series(
    [
      //get peer
      function(next){
        peer.next(config.get('hostname'),function(err,result){
          if(err) return next(err)
          if(!result) return next('No suitable peer found')
          winner = result
          next()
        })
      },
      function(next){
        logger.info('Starting to replicate ' + job.sha1)
        //setup streams
        var rs = fs.createReadStream(file.pathFromSha1(job.sha1))
        var ws = net.connect(winner.portImport,winner.ip)
        ws.on('connect',function(){
          rs.pipe(ws)
        })
        rs.on('data',function(data){
          bytesSent += data.length
        })
        rs.on('error',next)
        ws.on('error',next)
        rs.on('close',function(){
          var duration = (new Date().valueOf() - start) / 1000
          if(!bytesSent) bytesSent = 0
          if(!duration) duration = 1
          var bytesPerSec = prettyBytes(bytesSent / duration) + '/sec'
          logger.info(
              'Finished replicating ' + job.sha1 +
              ' to ' + winner.hostname + '.' + winner.domain +
              ' in ' + duration + ' seconds ' +
              'averaging ' + bytesPerSec)
          next()
        })
      }
    ],
    function(err){
      done(err)
    }
  )
}

var q = async.queue(clone,require('os').cpus().length)


/**
 * Export clone queue
 * @type {AsyncQueue<T>}
 */
module.exports = q
