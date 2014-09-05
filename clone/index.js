'use strict';
var async = require('async')
var fs = require('graceful-fs')
var net = require('net')
var prettyBytes = require('pretty-bytes')

var communicator = require('../helpers/communicator')
var file = require('../helpers/file')
var logger = require('../helpers/logger').create('clone')
var peer = require('../helpers/peer')

var config = require('../config')
var tcp


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
  var start = +(new Date())
  //start process
  async.series(
    [
      //get peer
      function(next){
        peer.next(config.hostname,function(err,result){
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
          var duration = ((+new Date()) - start) / 1000
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

var q = async.queue(clone,config.clone.concurrency || 1)


/**
 * Handle new jobs
 * @param {*} message
 */
var newJob = function(message){
  q.push({sha1: message.sha1})
}


if(require.main === module){
  var start = function(done){
    //start tcp
    tcp = communicator.TCP({port: config.clone.port, host: config.clone.host})
    // shred:job:push - queue entry acceptor
    tcp.on('clone',function(message,socket){
      newJob(message,socket)
    })
    logger.info('Listening for new clone jobs')
    //check and see if there is a snapshot if so load it
    done()
  }
  var stop = function(done){
    tcp.close(done)
  }
  process.on('message',function(msg){
    if('stop' === msg){
      stop(function(err){
        if(err) process.send({status: 'error', message: err})
        process.exit(err ? 1 : 0)
      })
    }
  })
  start(function(err){
    if(err){
      process.send({status: 'error', message: err})
      process.exit(1)
    }
    process.send({status: 'ok'})
  })
}
