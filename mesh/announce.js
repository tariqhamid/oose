'use strict';
var logger = require('../helpers/logger')
  , redis = require('../helpers/redis')
  , jobs = require('../helpers/jobs')
  , config = require('../config')
  , os = require('os')
  , util = require('util')

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
    logger.info(os.EOL + util.inspect(peer))
  }
}

//accept the multicast announce
var announceListen = function(peer){
  peer.udp.on('announce',function(packet,rinfo){
    redis.hgetall('peers:' + config.get('hostname'),function(err,selfPeer){
      if(err) logger.error(err)
      else if(packet.hostname === selfPeer.hostname && packet.ip !== selfPeer.ip){
        logger.error('Ignored announce from ' + rinfo.address + ' claiming to have our hostname!!')
      } else {
        redis.hgetall('peers:' + packet.hostname,function(err,oldPeer){
          if(err) logger.error(err)
          else{
            if(!oldPeer) oldPeer = {}
            //populate details
            var peer = {}
            peer.latency = packet.sent - (oldPeer.sent || 0) - config.get('mesh.interval.announce')
            if(peer.latency < 0) peer.latency = 0
            peer.sent = packet.sent
            peer.hostname = packet.hostname
            peer.ip = rinfo.address
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
              redis.sadd('storeList',packet.hostname,function(err){
                if(err) logger.error('Couldnt save peer to storeList ' + err)
              })
              redis.zadd('peerRank',parseInt(peer.availableCapacity,10),packet.hostname,function(err){
                if(err) logger.error('Couldnt add peer to peerRank ' + err)
              })
            }
            if(packet.services.indexOf('prism') > 0){
              peer.prismPort = packet.prismPort
              redis.sadd('prismList',packet.hostname,function(err){
                if(err) logger.error('Coudlnt add peer to prismList ' + err)
              })
            }
            //save to redis
            redis.hmset('peers:' + packet.hostname,peer,function(err){
              if(err) logger.error(err)
              //start a prism sync on the first one
              if(config.get('prism.enabled') && packet.services.indexOf('store') > 0 && !oldPeer){
                jobs.create('prismSync',{
                  title: 'Sync or build the global hash table',
                  hostname: packet.hostname
                }).save()
              }
              announceLog(selfPeer,oldPeer,peer,packet)
            })
          }
        })
      }
    })
  })
}

var announceTimeout
var announceSend = function(conn){
  redis.hgetall('peers:' + config.get('hostname'),function(err,peer){
    if(err) logger.error(err)
    else if(!peer){
      logger.warn('Announce delayed, peer not ready')
      announceTimeout = setTimeout(function(){announceSend(conn)},config.get('mesh.interval.announce'))
    }
    else{
      var message = {}
      message.sent = new Date().getTime()
      message.hostname = config.get('hostname')
      message.meshPort = config.get('mesh.port')
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
      conn.udp.send('announce',message)
      announceTimeout = setTimeout(function(){announceSend(conn)},config.get('mesh.interval.announce'))
    }
  })
}


/**
 * Start announcing
 * @param {object} conn
 */
exports.start = function(conn){
  announceListen(conn)
  announceSend(conn)
}


/**
 * Stop announcing
 */
exports.stop = function(){
  if(announceTimeout)
    clearTimeout(announceTimeout)
}
