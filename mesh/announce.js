'use strict';
var conn = require('./index')
  , logger = require('../helpers/logger')
  , redis = require('../helpers/redis')
  , config = require('../config')
  , os = require('os')
  , util = require('util')
  , async = require('async')

//announcements
var announceLog = function(selfPeer,oldPeer,peer,packet){
  if(config.get('mesh.debug') || (packet.hostname !== oldPeer.hostname)){
    logger.info(
        '[' + peer.hostname + ']' +
        ' (' + peer.ip + ':' + peer.meshPort + ')' +
        ' announced at ' + new Date(peer.sent).toLocaleTimeString() +
        ' (latency ' + peer.latency + ')' +
        (config.get('mesh.debug') && packet.hostname === selfPeer.hostname ? ' [SELFIE]' : '')
    )
  }
  if(config.get('mesh.debug') > 1){
    logger.info('Announce:')
    logger.info(os.EOL + util.inspect(peer))
  }
  if(config.get('mesh.debug') > 2){
    logger.info('Self Peer:')
    logger.info(os.EOL + util.inspect(selfPeer))
  }
}

//accept the multicast announce
var announceListen = function(){
  conn.udp.on('announce',function(packet,rinfo){
    var selfPeer = {}
      , oldPeer = {}
      , peer = {}
    async.series(
      [
        //grab ourselves
        function(next){
          redis.hgetall('peers:' + config.get('hostname'),function(err,result){
            if(err) return next(err)
            console.log(result)
            selfPeer = result
            next()
          })
        },
        //check for duplicate hostname
        function(next){
          if(selfPeer.ip && packet.hostname === selfPeer.hostname && rinfo.address !== selfPeer.ip)
            return next('Ignored announce from ' + rinfo.address + ' claiming to have our hostname!!')
          next()
        },
        //grab previous peer information
        function(next){
          redis.hgetall('peers:' + packet.hostname,function(err,result){
            if(err) return next(err)
            oldPeer = result
            if(!oldPeer) oldPeer = {}
            next()
          })
        },
        //populate peer information to store
        function(next){
          //populate details
          peer.latency = packet.sent - (oldPeer.sent || 0) - config.get('mesh.interval.announce')
          if(peer.latency < 0) peer.latency = 0
          peer.sent = packet.sent
          peer.hostname = packet.hostname
          peer.ip = rinfo.address
          peer.readyState = packet.readyState
          peer.peerCount = packet.peerCount
          peer.meshPort = packet.meshPort
          peer.diskFree = packet.diskFree
          peer.diskTotal = packet.diskTotal
          peer.cpuIdle = packet.cpuIdle
          peer.cpuTotal = packet.cpuTotal
          peer.availableCapacity = packet.availableCapacity || 0
          peer.services = packet.services
          if(packet.services.indexOf('store') > 0){
            peer.importPort = packet.importPort
            peer.exportPort = packet.exportPort
          }
          if(packet.services.indexOf('prism') > 0){
            peer.prismPort = packet.prismPort
          }
          next()
        },
        //save to storeList
        function(next){
          if(packet.services.indexOf('store') > 0){
            redis.sadd('storeList',packet.hostname,next)
          } else next()
        },
        function(next){
          if(packet.services.indexOf('store') > 0){
            redis.zadd('peerRank',parseInt(peer.availableCapacity,10),packet.hostname,next)
          } else next()
        },
        //save to prism list
        function(next){
          if(packet.services.indexOf('prism') > 0){
            redis.sadd('prismList',packet.hostname,next)
          } else next()
        },
        //save to redis
        function(next){
          redis.hmset('peers:' + packet.hostname,peer,next)
        }
        //save to peerRank
      //process announce receipt
      ],function(err){
        if(err) logger.error(err)
        announceLog(selfPeer,oldPeer,peer,packet)
      }
    )
  })
}

var announceTimeout
var announceSend = function(){
  var peer = {}
    , message = {}
    , peerCount = 0
  async.series(
    [
      //find ourselves
      function(next){
        redis.hgetall('peers:' + config.get('hostname'),function(err,result){
          if(err) return next(err)
          if(!result) return next('Announce delayed, peer not ready')
          peer = result
          next()
        })
      },
      //find peerCount
      function(next){
        redis.zcount('peerRank',0,100,function(err,result){
          if(err) return next(err)
          peerCount = result
          next()
        })
      },
      //compose message
      function(next){
        message.sent = new Date().getTime()
        message.hostname = config.get('hostname')
        message.meshPort = config.get('mesh.port')
        message.readyState = peer.readyState || 0
        message.peerCount = peerCount
        message.diskFree = peer.diskFree
        message.diskTotal = peer.diskTotal
        message.cpuIdle = peer.cpuIdle
        message.cpuTotal = peer.cpuTotal
        message.availableCapacity = peer.availableCapacity
        message.services = ''
        if(config.get('store.enabled')){
          message.services += ',store'
          message.importPort = config.get('store.import.port')
          message.exportPort = config.get('store.export.port')
        }
        if(config.get('prism.enabled')){
          message.services += ',prism'
          message.prismPort = config.get('prism.port')
        }
        next()
      },
      //send message
      function(next){
        conn.udp.send('announce',message)
        next()
      }
    //setup the next timeout
    ],function(err){
      if(err) logger.error(err)
      announceTimeout = setTimeout(announceSend,config.get('mesh.interval.announce'))
    }
  )
}


/**
 * Start announcing
 * @param {function} done
 */
exports.start = function(done){
  if('function' !== typeof done) done = function(){}
  announceListen()
  announceSend()
  done()
}


/**
 * Stop announcing
 * @param {function} done
 */
exports.stop = function(done){
  if('function' !== typeof done) done = function(){}
  if(announceTimeout)
    clearTimeout(announceTimeout)
  done()
}
