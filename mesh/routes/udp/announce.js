'use strict';
var async = require('async')
var debug = require('debug')('oose:mesh:udp:announce')

var config = require('../../../config')
var logger = require('../../../helpers/logger').create('announce')
var redis = require('../../../helpers/redis')

var bootTimeout
var bootCb = null


/**
 * Log announcement
 * @param {object} selfPeer
 * @param {object} oldPeer
 * @param {object} peer
 * @param {object} packet
 */
var announceLog = function(selfPeer,oldPeer,peer,packet){
  var msg =
    peer.hostname +
    ' (' + peer.ip + ':' + peer.portMesh + ')' +
    ' @ ' + new Date(peer.sent).toLocaleTimeString() +
    ' (' +
    (('function' === typeof bootCb) ? 'bootreply' : 'latency ' + peer.latency) +
    ')' +
    ((packet.hostname === selfPeer.hostname) ? ' [SELFIE]' : '')
  debug(msg)
}


/**
 * Announce listen
 * @param {object} message
 * @param {dgram.rinfo} rinfo
 */
module.exports = function(message,rinfo){
  var selfPeer = {}
  var oldPeer = {}
  var peer = {}
  async.series(
    [
      //grab ourselves
      function(next){
        redis.hgetall('peer:db:' + config.hostname,function(err,result){
          if(err) return next(err)
          selfPeer = result
          next()
        })
      },
      //check for duplicate hostname
      function(next){
        if(
          selfPeer.ip &&
          message.hostname === selfPeer.hostname &&
          rinfo.address !== selfPeer.ip
          )
        {
          return next(
              'Ignored announce from ' + rinfo.address +
              ' claiming to have our hostname!!'
          )
        }
        next()
      },
      //grab previous peer information
      function(next){
        redis.hgetall('peer:db:' + message.hostname,function(err,result){
          if(err) return next(err)
          oldPeer = result
          if(!oldPeer) oldPeer = {}
          next()
        })
      },
      //populate peer information to store
      function(next){
        //populate details
        peer.latency =
          message.sent - (oldPeer.sent || 0) - config.mesh.announce.interval
        if(peer.latency < 0) peer.latency = 0
        peer.sent = message.sent
        peer.hostname = message.hostname
        peer.ip = rinfo.address
        peer.readyState = message.readyState
        peer.peerCount = message.peerCount
        peer.diskFree = message.diskFree
        peer.diskTotal = message.diskTotal
        peer.cpuUsed = message.cpuUsed
        peer.cpuCount = message.cpuCount
        peer.memoryFree = message.memoryFree
        peer.memoryTotal = message.memoryTotal
        peer.availableCapacity = message.availableCapacity || 0
        peer.services = message.services
        if(message.services.indexOf('store') >= 0){
          peer.portImport = message.portImport
          peer.portExport = message.portExport
        }
        if(message.services.indexOf('prism') >= 0){
          peer.portPrism = message.portPrism
        }
        if(message.services.indexOf('shredder') >= 0){
          peer.portShredder = message.portShredder
        }
        peer.portMesh = message.portMesh
        peer.netSpeed = message.netSpeed || 0
        peer.netInBps = message.netInBps || 0
        peer.netOutBps = message.netOutBps || 0
        next()
      },
      //save to storeList
      function(next){
        if(message.services.indexOf('store') > 0){
          redis.sadd('peer:store',message.hostname,function(err){
            if(err) err = 'Could not add to store list: ' + err
            next(err)
          })
        } else next()
      },
      function(next){
        if(message.services.indexOf('store') > 0){
          //issue #32 avail comes back infinity (this is a safeguard)
          if('Infinity' === peer.availableCapacity)
            peer.availableCapacity = 100
          redis.zadd(
            'peer:rank',
            +peer.availableCapacity,
            message.hostname,
            function(err){
              if(err) err = 'Could not store peer rank: ' + err
              next(err)
            }
          )
        } else next()
      },
      //save to prism list
      function(next){
        if(message.services.indexOf('prism') > 0){
          redis.sadd('peer:prism',message.hostname,function(err){
            if(err) err = 'Could not store to prism list: ' + err
            next(err)
          })
        } else next()
      },
      //save to peer ip map
      function(next){
        redis.hset('peer:ip',peer.ip,peer.hostname,function(err){
          if(err) err = 'Could not store to ip map: ' + err
          next(err)
        })
      },
      //save to redis
      function(next){
        redis.hmset('peer:db:' + message.hostname,peer,function(err){
          if(err) err = 'Could not store peer: ' + err
          next(err)
        })
      }
    ],
    //process announce receipt
    //each recv packet resets the return timer to 1/4 sec
    function(err){
      if(err) logger.error(err)
      clearTimeout(bootTimeout)
      if('function' === typeof bootCb){
        bootTimeout = setTimeout(function(){
          debug('booting completed')
          if('function' === typeof bootCb) bootCb()
          bootCb = null
        },250)
      }
      announceLog(selfPeer,oldPeer,peer,message)
    }
  )
}
