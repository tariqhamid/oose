'use strict';
var async = require('async')

var logger = require('../helpers/logger').create('mesh:announce')
var redis = require('../helpers/redis')

var config = require('../config')
var mesh = require('../mesh')


//announcements
var announceLog = function(selfPeer,oldPeer,peer,packet){
  logger.info(
      peer.hostname +
      ' (' + peer.ip + ':' + peer.portMesh + ')' +
      ' @ ' + new Date(peer.sent).toLocaleTimeString() +
      ' (latency ' + peer.latency + ')' +
      (config.mesh.debug && packet.hostname === selfPeer.hostname ? ' [SELFIE]' : '')
  )
  //logger.debug('Announce:' + os.EOL + util.inspect(peer))
  //logger.debug('Self Peer:' + os.EOL + util.inspect(selfPeer))
}

//accept the multicast announce
var announceListen = function(){
  mesh.udp.on('announce',function(packet,rinfo){
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
          if(selfPeer.ip && packet.hostname === selfPeer.hostname && rinfo.address !== selfPeer.ip)
            return next('Ignored announce from ' + rinfo.address + ' claiming to have our hostname!!')
          next()
        },
        //grab previous peer information
        function(next){
          redis.hgetall('peer:db:' + packet.hostname,function(err,result){
            if(err) return next(err)
            oldPeer = result
            if(!oldPeer) oldPeer = {}
            next()
          })
        },
        //populate peer information to store
        function(next){
          //populate details
          peer.latency = packet.sent - (oldPeer.sent || 0) - config.mesh.announce.interval
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
          if(packet.services.indexOf('store') > 0){
            peer.portImport = packet.portImport
            peer.portExport = packet.portExport
          }
          if(packet.services.indexOf('prism') > 0){
            peer.portPrism = packet.portPrism
          }
          peer.portMesh = packet.portMesh
          peer.netSpeed = packet.netSpeed || 0
          peer.netInBps = packet.netInBps || 0
          peer.netOutBps = packet.netOutBps || 0
          next()
        },
        //save to storeList
        function(next){
          if(packet.services.indexOf('store') > 0){
            redis.sadd('peer:store',packet.hostname,function(err){
              if(err) err = 'Could not add to store list: ' + err
              next(err)
            })
          } else next()
        },
        function(next){
          if(packet.services.indexOf('store') > 0){
            //issue #32 avail comes back infinity (this is a safeguard)
            if('Infinity' === peer.availableCapacity) peer.availableCapacity = 100
            redis.zadd('peer:rank',+peer.availableCapacity,packet.hostname,function(err){
              if(err) err = 'Could not store peer rank: ' + err
              next(err)
            })
          } else next()
        },
        //save to prism list
        function(next){
          if(packet.services.indexOf('prism') > 0){
            redis.sadd('peer:prism',packet.hostname,function(err){
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
          redis.hmset('peer:db:' + packet.hostname,peer,function(err){
            if(err) err = 'Could not store peer: ' + err
            next(err)
          })
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
        message.portImport = config.store.import.portPublic || peer.portImport || 0
        message.portExport = config.store.export.portPublic || peer.portExport || 0
        message.portPrism = config.prism.portPublic || peer.portPrism || 0
        message.portMesh = config.mesh.portPublic || peer.portMesh || 0
        message.netSpeed = peer.netSpeed || 0
        message.netInBps = peer.netInBps || 0
        message.netOutBps = peer.netOutBps || 0
        next()
      },
      //send message
      function(next){
        mesh.udp.send('announce',message)
        next()
      }
    //setup the next timeout
    ],function(err){
      if(err) logger.error(err)
      announceTimeout = setTimeout(announceSend,config.mesh.announce.interval)
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
