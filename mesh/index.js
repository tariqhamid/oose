'use strict';
/*jshint bitwise: false*/
var config = require('../config')
  , logger = require('../helpers/logger')
  , redis = require('../helpers/redis')
  , communicator = require('../helpers/communicator')
  , os = require('os')
  , util = require('util')
  , myStats = require('../helpers/peerStats')
  , nextPeer = require('../helpers/nextPeer')
  , jobs = require('../helpers/jobs')

//start stats collection
myStats.start(config.get('mesh.statInterval'))

//start nextPeer selection
setTimeout(function(){
  logger.info('Starting next peer selection')
  nextPeer.start(config.get('mesh.nextPeerInterval'))
},config.get('mesh.announceInterval') * 2)

//connection handles
var peer

//start peer ping
var pingHosts = {}
var pingTimeout
var pingSend = function(){
  var start = new Date().getTime()
  peer.udp.multicast.send('ping',function(){
    pingTimeout = setTimeout(pingSend,1000)
  })
  //server
  peer.udp.multicast.on('ping',function(req,rinfo){
    peer.udp.send(rinfo.port,rinfo.address,'ping')
  })
  //client
  peer.udp.on('ping',function(res,rinfo){
    pingHosts[rinfo.address] = new Date().getTime() - start
  })
}
var pingMax = function(){
  var max = 0
  for(var i in pingHosts){
    if(pingHosts.hasOwnProperty(i) && pingHosts[i] > max){
      max = pingHosts[i]
    }
  }
  return max
}
pingSend()


//announcements
var announceLog = function(selfPeer,oldPeer,peer,packet){
  if(config.get('mesh.debug') || (packet.handle !== oldPeer.handle)){
    logger.info(
        '[' + peer.handle + '] ' + peer.hostname +
        ' (' + peer.ip + ':' + peer.meshPort + ')' +
        ' posted an announce at ' + new Date(peer.sent).toLocaleTimeString() +
        ' (latency ' + peer.latency + ')' +
        (config.get('mesh.debug') && packet.handle === selfPeer.handle ? ' [SELFIE]' : '')
    )
  }
  if(config.get('mesh.debug') > 1){
    logger.info(os.EOL + util.inspect(peer))
  }
}
//accept the multicast announce
peer.udp.multicast.on('announce',function(packet,rinfo){
  redis.hgetall('peers:' + config.get('hostname'),function(err,selfPeer){
    if(err) logger.error(err)
    else {
      redis.hgetall('peers:' + packet.hostname,function(err,oldPeer){
        if(err) logger.error(err)
        else {
          if(!oldPeer) oldPeer = {}
          //populate details
          var peer = {}
          peer.latency = packet.sent - (oldPeer.sent || 0) - config.get('mesh.announceInterval')
          if(peer.latency < 0) peer.latency = 0
          peer.sent = packet.sent
          peer.handle = packet.handle
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

var announceTimeout
var announceSend = function(){
  redis.hgetall('peers:' + config.get('hostname'),function(err,peer){
    if(err) logger.error(err)
    else if(!peer){
      logger.warn('Announce delayed, peer not ready')
      announceTimeout = setTimeout(announceSend,config.get('mesh.announceInterval'))
    }
    else{
      var message = {}
      message.sent = new Date().getTime()
      message.hostname = config.get('hostname')
      message.meshPort = config.get('mesh.port')
      message.handle = peer.handle
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
      peer.udp.multicast.send('announce',message)
      announceTimeout = setTimeout(announceSend,config.get('mesh.announceInterval'))
    }
  })
}


/**
 * Export unicast connections
 * @type {ReliableEventEmitter}
 */
exports.peer = peer


/**
 * Start mesh
 * @param {function} done
 */
exports.start = function(done){
  //start unicast
  peer = {
    udp: new communicator.UDP(config.get('mesh.port')),
    tcp: new communicator.TCP(config.get('mesh.port'))
  }
  //setup multicast
  peer.udp.addMulticast(config.get('mesh.address'),config.get('mesh.ttl'))
  //start ping
  pingSend()
  //start announce
  announceSend()
  done()
}


/**
 * Stop mesh
 */
exports.stop = function(){
  if(pingTimeout)
    clearTimeout(pingTimeout)
  if(announceTimeout)
    clearTimeout(announceTimeout)
}

if(require.main === module){
  exports.start(function(){
    logger.info('Mesh started and announcing')
  })
}
