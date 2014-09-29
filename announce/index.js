'use strict';
var async = require('async')
var debug = require('debug')('oose:announce')
var child = require('infant').child

var logger = require('../helpers/logger').create('announce')
var Multicast = require('../helpers/multicast')
var redis = require('../helpers/redis')

var nullFunc = function(){}

var announceInterval
var config = require('../config')
var booting = false
var bootDone = nullFunc
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
 * @param {function} done
 */
var announceCompose = function(done){
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
      },//find peerCount
      function(next){
        redis.zcount('peer:rank',0,100,function(err,result){
          if(err) return next(err)
          peerCount = result
          next()
        })
      },//compose message
      function(next){
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
        next()
      }
    ],
    function(err){
      if(err) return done(err)
      done(null,message)
    }
  )
}


/**
 * Send the announce message via multicast
 * @param {EventEmitter} multicast
 */
var announceSend = function(multicast){
  announceCompose(function(err,message){
    if(err){
      logger.error(err)
      return
    }
    multicast.send('announce',message)
  })
}


/**
 * Parse an announce packet and stuff it in redis
 * @param {Buffer} packet
 * @param {dgram.rinfo} rinfo
 */
var announceParse = function(packet,rinfo){
  var ourself = {}
  var previousPeer = {}
  var peer = {}
  async.series(
    [
      //grab ourselves
      function(next){
        redis.hgetall('peer:db:' + config.hostname,function(err,result){
          if(err) return next(err)
          ourself = result
          next()
        })
      },
      //check for duplicate hostname
      function(next){
        if(
          ourself.ip &&
          packet.hostname === ourself.hostname &&
          rinfo.address !== ourself.ip
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
        redis.hgetall('peer:db:' + packet.hostname,function(err,result){
          if(err) return next(err)
          previousPeer = result
          if(!previousPeer) previousPeer = {}
          next()
        })
      },
      //populate peer information to store
      function(next){
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
        next()
      },
      //save to storeList
      function(next){
        if(packet.services.indexOf('store') < 1) return next()
        redis.sadd('peer:store',packet.hostname,function(err){
          if(err) err = 'Could not add to store list: ' + err
          next(err)
        })
      },
      function(next){
        if(0 === packet.services.indexOf('store') > 0) return next()
        //issue #32 avail comes back infinity (this is a safeguard)
        if('Infinity' === peer.availableCapacity)
          peer.availableCapacity = 100
        redis.zadd(
          'peer:rank',
          +peer.availableCapacity,
          packet.hostname,
          function(err){
            if(err) err = 'Could not store peer rank: ' + err
            next(err)
          }
        )
      },
      //save to prism list
      function(next){
        if(packet.services.indexOf('prism') < 1) return next()
        redis.sadd('peer:prism',packet.hostname,function(err){
          if(err) err = 'Could not store to prism list: ' + err
          next(err)
        })
      },
      //save to peer ip map
      function(next){
        redis.hset('peer:ip',peer.ip,peer.hostname,function(err){
          if(err) err = 'Could not store to ip map: ' + err
          next(err)
        })
      },
      //save to peer list
      function(next){
        redis.sadd('peer:list',peer.hostname,function(err){
          if(err) err = 'Could not store to peer list: ' + err
          next(err)
        })
      },
      //save to redis
      function(next){
        redis.hmset('peer:db:' + packet.hostname,peer,function(err){
          if(err) err = 'Could not store peer: ' + err
          next(err)
        })
      }
    ],
    function(err){
      if(err) return logger.error(err)
      if(booting) bootReceive()
      announceLog(ourself,previousPeer,peer,packet)
    }
  )
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
      if('function' !== typeof done) done = nullFunc
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
      if('function' !== typeof done) done = nullFunc
      if(announceInterval)
        clearInterval(announceInterval)
      done()
    }
  )
}
