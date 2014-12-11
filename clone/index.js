'use strict';
var async = require('async')
var P = require('bluebird')
var axon = require('axon')
var crypto = require('crypto')
var debug = require('debug')('oose:clone')
var fs = require('graceful-fs')
var child = require('infant').child
var net = require('net')
var prettyBytes = require('pretty-bytes')
var promisePipe = require('promisepipe')
var through2 = require('through2')

var file = require('../helpers/file')
var logger = require('../helpers/logger').create('clone')
var peer = require('../helpers/peer')

var config = require('../config')
var server = axon.socket('rep')

//make some promises
P.promisifyAll(fs)
P.promisifyAll(server)


/**
 * Clone a file to another peer
 * @param {object} job
 * @return {P}
 */
var clone = function(job){
  //track some stats
  var winner
  var bytesSent = 0
  var filePath = file.pathFromSha1(job.sha1)
  var start = +(new Date())
  var shasum = crypto.createHash('sha1')
  var sniff = through2(function(chunk,enc,next){
    try {
      bytesSent = bytesSent + chunk.length
      shasum.update(chunk)
      next(null,chunk)
    } catch(err){
      next(err)
    }
  })
  return peer.next(config.locale.host)
    .then(function(result){
      if(!filePath) throw new Error('Invalid sha1 passed for path')
      if(!result) throw new Error('No suitable peer found')
      winner = result
      if(!fs.existsSync(filePath)) throw new Error('File to clone doesnt exist')
      logger.info('Starting to replicate ' + job.sha1)
      //setup readable from file system
      var rs = fs.createReadStream(filePath)
      //connect to our per for writing
      var ws = net.connect(+winner.portImport,winner.ip)
      return promisePipe(rs,sniff,ws)
    })
    .then(function(){
      var sha1 = shasum.digest('hex')
      var duration = ((+new Date()) - start) / 1000
      if(!bytesSent) bytesSent = 0
      if(!duration) duration = 1
      var bytesPerSec = prettyBytes(bytesSent / duration) + '/sec'
      logger.info(
        'Finished replicating ' +
        prettyBytes(bytesSent) + ' ' +
        job.sha1 +
        ' as ' + sha1 +
        ' to ' + winner.hostname + '.' + winner.domain +
        ' in ' + duration + ' seconds ' +
        'averaging ' + bytesPerSec)
      return sha1
    })
}

var q = async.queue(
  function(job,done){
    clone(done).then(function(){done()},done)
  },
  config.clone.concurrency || 1
)


/**
 * Handle new jobs
 * @param {object} message
 * @param {function} reply
 */
var newJob = function(message,reply){
  debug('got new job',message)
  q.push({sha1: message.sha1})
  reply(null,{status: 'ok', position: q.length()})
}

if(require.main === module){
  child(
    'oose:' + config.locale.id + ':clone',
    function(done){
      //start tcp
      server.bind(config.clone.port,config.clone.host)
      // shred:job:push - queue entry acceptor
      server.on('message',function(message,reply){
        newJob(message,reply)
      })
      server.on('error',function(err){
        logger.warning('Server socket error',err)
      })
      debug('Listening for new clone jobs')
      //check and see if there is a snapshot if so load it
      done()
    },
    function(done){
      server.close(done)
    }
  )
}
