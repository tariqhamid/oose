'use strict';
/*jshint bitwise: false*/
var config = require('../config')
  , logger = require('../helpers/logger')
  , redis = require('../helpers/redis')
  , Communicator = require('../helpers/communicator')
  , os = require('os')
  , util = require('util')
  , myStats = require('../helpers/peerStats')

//start stats collection
myStats.start(config.get('mesh.statInterval') || 1000)

var logAnnounce = function(selfPeer,oldPeer,peer,packet){
  if(config.get('mesh.debug') || (packet.handle !== oldPeer.handle)){
    logger.info(
      packet.handle +
      ' posted an announce' +
      ' at ' +
      new Date(peer.sent).toLocaleTimeString() +
      ' (latency ' + peer.latency + ')' +
      (config.get('mesh.debug') && packet.handle === selfPeer.handle ? ' [SELFIE]' : '')
    )
  }
  if(config.get('mesh.debug') > 1){
    logger.info(os.EOL + util.inspect(peer))
  }
}

//setup multicast networking
var multicast = new Communicator({
  proto: 'mcast',
  port: config.get('mesh.port'),
  mcast: {
    address: config.get('mesh.address'),
    ttl: config.get('mesh.ttl')
  }
})
multicast.useReceive(function(packet){
  redis.hgetall('peers:' + config.get('hostname'),function(err,selfPeer){
    if(err) logger.error(err)
    else {
      redis.hgetall('peers:' + packet.hostname,function(err,oldPeer){
        if(err) logger.error(err)
        else {
          var peer = {}
          peer.latency = packet.sent - (oldPeer.sent || 0) - config.get('mesh.interval')
          if(peer.latency < 0) peer.latency = 0
          peer.sent = packet.sent
          peer.handle = packet.handle
          peer.ip = packet.rinfo.address
          peer.load = packet.load
          peer.free = packet.free
          redis.hmset('peers:' + packet.hostname,peer,function(err){
            if(err) logger.error(err)
            logAnnounce(selfPeer,oldPeer,peer,packet)
          })
        }
      })
    }
  })
})

var announceTimeout

var sendAnnounce = function(){
  redis.hgetall('peers:' + config.get('hostname'),function(err,peer){
    if(err) logger.error(err)
    else if(!peer){
      logger.warn('Announce delayed, peer not ready')
      announceTimeout = setTimeout(sendAnnounce,config.get('mesh.interval'))
    } else {
      var message = {}
      message.hostname = config.get('hostname')
      message.handle = peer.handle
      message.load = peer.load
      message.free = peer.free
      multicast.send(message,function(){
        announceTimeout = setTimeout(sendAnnounce,config.get('mesh.interval'))
      })
    }
  })
}

exports.multicast = multicast
exports.start = function(done){
  sendAnnounce()
  done()
}
exports.stop = function(){
  if(announceTimeout)
    clearTimeout(announceTimeout)
}

if(require.main === module){
  exports.start(function(){
    logger.info('Mesh started and announcing')
  })
}
