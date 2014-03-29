'use strict';
/*jshint bitwise: false*/
var config = require('../config')
  , logger = require('../helpers/logger')
  , redis = require('../helpers/redis')
  , Communicator = require('../helpers/communicator')
  , os = require('os')
  , util = require('util')
  , myStats = require('../helpers/peerStats')
  , nextPeer = require('../helpers/nextPeer')
  , jobs = require('../helpers/jobs')
  , Emitter = require('scuttlebutt/events')
  , net = require('net')

//setup the command bus
var peerMap = {}
var cmdBus = new Emitter()

//start stats collection
myStats.start(config.get('mesh.statInterval'))

//start nextPeer selection
setTimeout(function(){
  logger.info('Starting next peer selection')
  nextPeer.start(config.get('mesh.nextPeerInterval'))
},config.get('mesh.announceInterval') * 2)


//setup multicast discovery
var multicast = new Communicator({
  proto: 'mcast',
  port: config.get('mesh.port'),
  mcast: {
    address: config.get('mesh.address'),
    ttl: config.get('mesh.ttl')
  }
})
multicast.useReceive(function(packet){
  //connect to the nodes scuttlebutt
  if(!peerMap[packet.hostname] && packet.hostname !== config.get('hostname')){
    logger.info('Setting up cmdBus connection to ' + packet.rinfo.address + ':' + packet.rinfo.port)
    var stream = net.connect(packet.rinfo.port,packet.rinfo.address)
    stream.pipe(cmdBus.createStream()).pipe(stream)
    peerMap[packet.hostname] = {stream: stream, ip: packet.rinfo.address, port: packet.rinfo.port}
  } else {
    peerMap[packet.hostname] = {}
    peerMap[packet.hostname].ip = packet.rinfo.address
    peerMap[packet.hostname].port = packet.rinfo.port
  }
})
var discoverTimeout
var discoverSend = function(){
  var message = {}
  message.hostname = config.get('hostname')
  multicast.send(message,function(){
    discoverTimeout = setTimeout(discoverSend,config.get('mesh.discoverInterval'))
  })
}

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

cmdBus.on('announce',function(packet){
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
          peer.ip = peerMap[packet.hostname] ? peerMap[packet.hostname].ip : ''
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
      cmdBus.emit('announce',message)
      announceTimeout = setTimeout(announceSend,config.get('mesh.announceInterval'))
    }
  })
}


/**
 * Access to the multicast setup
 * @type {Communicator}
 */
exports.multicast = multicast


/**
 * Export command bus
 * @type {ReliableEventEmitter}
 */
exports.bus = cmdBus


/**
 * Start mesh
 * @param {function} done
 */
exports.start = function(done){
  //start a scuttlebutt server
  net.createServer(function(stream){
    stream.pipe(cmdBus.createStream()).pipe(stream)
  }).listen(config.get('mesh.port'))
  //send out discovery packet
  discoverSend()
  //start announcing
  announceSend()
  done()
}


/**
 * Stop mesh
 */
exports.stop = function(){
  if(announceTimeout)
    clearTimeout(announceTimeout)
  if(discoverTimeout)
    clearTimeout(discoverTimeout)
}

if(require.main === module){
  exports.start(function(){
    logger.info('Mesh started and announcing')
  })
}
