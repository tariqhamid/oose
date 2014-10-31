'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:announce')
var child = require('infant').child

var logger = require('../helpers/logger').create('announce')
var Multicast = require('../helpers/multicast')
var redis = require('../helpers/redis')

var announceInterval
var config = require('../config')
var booting = false
var bootDone = function(){}
var bootTimeout
var multicast


/**
 * Set the boot timeout
 */
var bootSetTimeout = function(){
  bootTimeout = setTimeout(function(){
    //turn off booting mode
    booting = false
    //call the done function if its defined
    if('function' === typeof bootDone)
      bootDone()
  },config.announce.bootTimeout)
}


/**
 * Receive a boot packet and extend the timeout
 */
var bootReceive = function(){
  clearTimeout(bootTimeout)
  bootSetTimeout()
}


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
    ' (' + peer.ip + ':' + peer.portAnnounce + ')' +
    ' @ ' + new Date(peer.sent).toLocaleTimeString() +
    ' (' +
    (('function' === typeof bootCb) ? 'bootreply' : 'latency ' + peer.latency) +
    ')' +
    ((packet.hostname === selfPeer.hostname) ? ' [SELFIE]' : '')
  debug(msg)
}


/**
 * Compose the announce message
 * @return {P}
 */
var announceCompose = function(){
  var peer = {}
  var message = {}
  var peerCount = 0
  return redis.hgetallAsync('peer:db:' + config.hostname)
    .then(function(result){
      peer = result
      if(!peer) peer = {}
      return redis.zcountAsync('peer:rank',0,100)
    })
    .then(function(result){
      peerCount = result
      message.sent = +(new Date())
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
      message.portPrism = config.prism.portPublic || peer.portPrism || 0
      message.portShredder =
        config.shredder.portPublic || peer.portShredder || 0
      message.portAnnounce = config.announce.port || 0
      message.portPing = config.ping.port || 0
      message.netSpeed = peer.netSpeed || 0
      message.netInBps = peer.netInBps || 0
      message.netOutBps = peer.netOutBps || 0
      message.importHits = peer.importHits || 0
      return message
    })
}


/**
 * Send the announce message via multicast
 * @param {EventEmitter} multicast
 */
var announceSend = function(multicast){
  announceCompose()
    .then(function(message){
      multicast.send('announce',message)
    })
    .catch(function(err){
      logger.error(err)
    })
}


/**
 * Parse an announce packet and stuff it in redis
 * @param {Buffer} packet
 * @param {object} rinfo
 */
var announceParse = function(packet,rinfo){
  var ourself = {}
  var previousPeer = {}
  var peer = {}
  redis.hgetallAsync('peer:db:' + config.hostname)
    .then(function(result){
      ourself = result
      if(
        ourself.ip &&
        packet.hostname === ourself.hostname &&
        rinfo.address !== ourself.ip
      )
      {
        throw new Error('Ignored announce from ' + rinfo.address +
          ' claiming to have our hostname!!')
      }
      return redis.hgetallAsync('peer:db:' + packet.hostname)
    })
    .then(function(result){
      previousPeer = result
      if(!previousPeer) previousPeer = {}
      //populate details
      peer.latency =
        packet.sent - (previousPeer.sent || 0) - config.announce.interval
      if(peer.latency < 0) peer.latency = 0
      peer.sent = packet.sent
      peer.hostname = packet.hostname
      peer.ip = rinfo.address
      peer.readyState = packet.readyState
      peer.peerCount = packet.peerCount
      peer.diskFree = packet.diskFree
      peer.diskTotal = packet.diskTotal
      peer.cpuUsed = packet.cpuUsed
      peer.cpuCount = packet.cpuCount
      peer.memoryFree = packet.memoryFree
      peer.memoryTotal = packet.memoryTotal
      peer.availableCapacity = packet.availableCapacity || 0
      peer.services = packet.services
      if(packet.services.indexOf('store') >= 0){
        peer.portImport = packet.portImport
        peer.portExport = packet.portExport
      }
      if(packet.services.indexOf('prism') >= 0){
        peer.portPrism = packet.portPrism
      }
      if(packet.services.indexOf('shredder') >= 0){
        peer.portShredder = packet.portShredder
      }
      peer.portAnnounce = packet.portAnnounce
      peer.portPing = packet.portPing
      peer.netSpeed = packet.netSpeed || 0
      peer.netInBps = packet.netInBps || 0
      peer.netOutBps = packet.netOutBps || 0
      peer.importHIts = packet.importHits || 0
      if('Infinity' === peer.availableCapacity)
        peer.availableCapacity = 100
      var promises = []
      if(packet.services.indexOf('store') > 0){
        promises.push(redis.saddAsync('peer:store',packet.hostname))
        promises.push(redis.zaddAsync(
          'peer:rank',+peer.availableCapacity,packet.hostname))
      }
      if(packet.services.indexOf('prism') > 0){
        promises.push(redis.saddAsync('peer:prism',packet.hostname))
      }
      promises.push(redis.hsetAsync('peer:ip',peer.ip,peer.hostname))
      promises.push(redis.saddAsync('peer:list',peer.hostname))
      promises.push(redis.hmsetAsync('peer:db:' + packet.hostname,peer))
      return P.all(promises)
    })
    .then(function(){
      if(booting) bootReceive()
      announceLog(ourself,previousPeer,peer,packet)
    })
    .catch(function(err){
      logger.error(err)
    })
}


/**
 * Boot the announce system and accept all responses first
 * @param {EventEmitter} multicast
 * @param {function} done
 */
var boot = function(multicast,done){
  //assign this callback to bootDone so it will step when we are done
  bootDone = done
  //turn on booting mode
  booting = true
  //setup our timeout to move on without other peers
  bootSetTimeout()
  //tell everyone we are booting so we get announce responses
  multicast.send('boot')
  //this is where we would call bootDone but the timeout will handle it
}


if(require.main === module){
  child(
    'oose:announce',
    function(done){
      //setup our multicast handler
      if(!multicast){
        multicast = new Multicast()
        multicast.bind(
          config.announce.port,
          config.announce.host,
          config.announce.multicast,
          function(err){
            if(err) return done(err)
            //start listening for announce packets
            multicast.on('announce',announceParse)
            //send announce packet on boot receive
            multicast.on('boot',function(){announceSend(multicast)})
            //boot up, get an announce from the rest of the cluster
            boot(multicast,function(err){
              if(err) return done(err)
              //start announcing
              announceInterval = setInterval(
                function(){announceSend(multicast)},
                config.announce.interval
              )
              done()
            })
          }
        )
      }
    },
    function(done){
      if(announceInterval)
        clearInterval(announceInterval)
      done()
    }
  )
}
