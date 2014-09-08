'use strict';
var async = require('async')
var debug = require('debug')('oose:mesh:announce')

var logger = require('../helpers/logger').create('mesh:announce')
var redis = require('../helpers/redis')

var config = require('../config')
var mesh = require('../mesh')

var nullFunc = function(){}

var announceInterval


/**
 * Send announcement
 * @param {Multicast} multicast
 */
var announceSend = function(multicast){
  var peer = {}
  var message = {}
  var peerCount = 0
  async.series(
    [
      //find ourselves
      function(next){
        redis.hgetall('peer:db:' + config.hostname,function(err,result){
          if(err) return next(err)
          if(!result) return next('Announce delayed, peer not ready')
          peer = result
          next()
        })
      },
      //find peerCount
      function(next){
        redis.zcount('peer:rank',0,100,function(err,result){
          if(err) return next(err)
          peerCount = result
          next()
        })
      },
      //compose message
      function(next){
        message.sent = new Date().getTime()
        message.hostname = config.hostname
        message.readyState = peer.readyState || 0
        message.peerCount = peerCount
        message.diskFree = peer.diskFree
        message.diskTotal = peer.diskTotal
        message.cpuUsed = peer.cpuUsed
        message.cpuCount = peer.cpuCount
        message.memoryFree = peer.memoryFree
        message.memoryTotal = peer.memoryTotal
        message.availableCapacity = peer.availableCapacity
        message.services = peer.services
        message.portImport =
          config.store.import.portPublic || peer.portImport || 0
        message.portExport =
          config.store.export.portPublic || peer.portExport || 0
        message.portPrism =
          config.prism.portPublic || peer.portPrism || 0
        message.portShredder =
          config.shredder.portPublic || peer.portShredder || 0
        message.portMesh =
          config.mesh.portPublic || peer.portMesh || 0
        message.netSpeed = peer.netSpeed || 0
        message.netInBps = peer.netInBps || 0
        message.netOutBps = peer.netOutBps || 0
        next()
      },
      //send message
      function(next){
        multicast.udp.send('announce',message,next)
      }
    ],function(err){
      if(err) logger.error(err)
    }
  )
}


/**
 * Start announcing
 * @param {function} done
 */
exports.start = function(done){
  if('function' !== typeof done) done = nullFunc
  mesh.udp.send(
    'boot',
    null,
    function(){
      debug('boot packet sent')
    }
  )
  announceInterval = setInterval(
    function(){announceSend(mesh)},
    config.mesh.announce.interval
  )
}


/**
 * Stop announcing
 * @param {function} done
 */
exports.stop = function(done){
  if('function' !== typeof done) done = nullFunc
  if(announceInterval)
    clearInterval(announceInterval)
  done()
}
'use strict';
var async = require('async')
var debug = require('debug')('oose:mesh:announce')

var logger = require('../helpers/logger').create('mesh:announce')
var redis = require('../helpers/redis')

var config = require('../config')
var mesh = require('../mesh')

var nullFunc = function(){}

var announceInterval


/**
 * Send announcement
 * @param {Multicast} multicast
 */
var announceSend = function(multicast){
  var peer = {}
  var message = {}
  var peerCount = 0
  async.series(
    [
      //find ourselves
      function(next){
        redis.hgetall('peer:db:' + config.hostname,function(err,result){
          if(err) return next(err)
          if(!result) return next('Announce delayed, peer not ready')
          peer = result
          next()
        })
      },
      //find peerCount
      function(next){
        redis.zcount('peer:rank',0,100,function(err,result){
          if(err) return next(err)
          peerCount = result
          next()
        })
      },
      //compose message
      function(next){
        message.sent = new Date().getTime()
        message.hostname = config.hostname
        message.readyState = peer.readyState || 0
        message.peerCount = peerCount
        message.diskFree = peer.diskFree
        message.diskTotal = peer.diskTotal
        message.cpuUsed = peer.cpuUsed
        message.cpuCount = peer.cpuCount
        message.memoryFree = peer.memoryFree
        message.memoryTotal = peer.memoryTotal
        message.availableCapacity = peer.availableCapacity
        message.services = peer.services
        message.portImport =
          config.store.import.portPublic || peer.portImport || 0
        message.portExport =
          config.store.export.portPublic || peer.portExport || 0
        message.portPrism =
          config.prism.portPublic || peer.portPrism || 0
        message.portShredder =
          config.shredder.portPublic || peer.portShredder || 0
        message.portMesh =
          config.mesh.portPublic || peer.portMesh || 0
        message.netSpeed = peer.netSpeed || 0
        message.netInBps = peer.netInBps || 0
        message.netOutBps = peer.netOutBps || 0
        next()
      },
      //send message
      function(next){
        multicast.udp.send('announce',message,next)
      }
    ],function(err){
      if(err) logger.error(err)
    }
  )
}


/**
 * Start announcing
 * @param {function} done
 */
exports.start = function(done){
  if('function' !== typeof done) done = nullFunc
  mesh.udp.send(
    'boot',
    null,
    function(){
      debug('boot packet sent')
    }
  )
  announceInterval = setInterval(
    function(){announceSend(mesh)},
    config.mesh.announce.interval
  )
}


/**
 * Stop announcing
 * @param {function} done
 */
exports.stop = function(done){
  if('function' !== typeof done) done = nullFunc
  if(announceInterval)
    clearInterval(announceInterval)
  done()
}
