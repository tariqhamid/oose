'use strict';
/*jshint bitwise: false*/
var config = require('../config')
  , logger = require('../helpers/logger')
  , ObjectManage = require('object-manage')
  , Communicator = require('./communicator')
  , os = require('os')
  , ds = require('diskspace')
  , bencode = require('bencode')
  , dgram = require('dgram')
  , crc32 = require('buffer-crc32')
  , path = require('path')
  , shortlink = require('shortlink')
  , ip = require('ip')

//utility functions
var swap32 = function swap32(val){
  return ((val & 0xFF) << 24) |
    ((val & 0xFF00) << 8) |
    ((val >> 8) & 0xFF00) |
    ((val >> 24) & 0xFF)
}

//stateful node registry
var nodes = new ObjectManage({})
  , _self = config.get('hostname')
nodes.set([_self,'ip'],'127.0.0.2')
var filter = function(d){
  if(('IPv4' !== d.family) || (d.internal)){ return false }
  nodes.set([_self,'ip'],d.address)
  return true
}
var int = os.networkInterfaces()
for(var i in int) { if(int.hasOwnProperty(i)) int[i].some(filter) }
nodes.set([_self,'sig'],(new Date().getTime()) & 0xffffffff)
nodes.set([_self,'handle'],shortlink.encode(
  Math.abs(
    swap32(ip.toLong(nodes.get([_self,'ip'])))
    ^
    nodes.get([_self,'sig'])
  )
  & 0xffffffff
))

//node registry helper functions
var findNodeIP = function(where){
  var n = nodes.get()
    , rv = where
  for(var hostname in n){
    if(n.hasOwnProperty(hostname)){
      if(where === hostname) rv = n[hostname].ip
      if(where === n[hostname].handle) rv = n[hostname].ip
    }
  }
  return rv
}

var cpuAverage = function(){
  var totalIdle = 0
    , totalTick = 0
  var cpus = os.cpus()
  for(var i=0,len=cpus.length; i<len; i++){
    for(var type in cpus[i].times){
      if(cpus[i].times.hasOwnProperty(type)){ totalTick += cpus[i].times[type] }
    }
    totalIdle += cpus[i].times.idle
  }
  return {idle: totalIdle / cpus.length, total: totalTick / cpus.length}
}
var lastMeasure = cpuAverage()
var getLoad = function(){
  var thisMeasure = cpuAverage()
  var percentageCPU = 100 - ~~
    (
      100 *
      (thisMeasure.idle - lastMeasure.idle) /
      (thisMeasure.total - lastMeasure.total)
    )
  lastMeasure = thisMeasure
  return percentageCPU
}

//setup multicast networking
var multiCast = new Communicator({
  proto: 'mcast',
  port: config.get('mesh.port'),
  mcast: {
    address: config.get('mesh.address'),
    ttl: config.get('mesh.ttl')
  }
})
multiCast.useReceive(function(pkt){
  //update nodes state in memory
  nodes.set([pkt.hostname,'handle'],pkt.handle)
  nodes.set([pkt.hostname,'ip'],pkt.rinfo.address)
  nodes.set([pkt.hostname,'load'],pkt.load)
  nodes.set([pkt.hostname,'free'],pkt.free)
  nodes.set([pkt.hostname,'latency'],
    (pkt.sent - nodes.get([pkt.hostname,'sent'])) | 0
  )
  nodes.set([pkt.hostname,'sent'],pkt.sent)
  if(
    config.get('mesh.debug') ||
    (pkt.handle !== nodes.get([_self,'handle']))
  ){
    logger.info(
      pkt.handle +
        ' posted an announce' +
        ' at ' +
        new Date(nodes.get([pkt.hostname,'sent'])).toLocaleTimeString() +
        ' (latency ' + nodes.get([pkt.hostname,'latency']) + ')' +
        (
          (config.get('mesh.debug') &&
          (pkt.handle === nodes.get([_self,'handle']))
          ) ? ' [SELFIE]' : ''
        )
    )
  }
  if(config.get('mesh.debug') > 1){
    logger.info(os.EOL + require('util').inspect(nodes.get()))
  }
})

var sendAnnounce = function(){
  var message = {}
  message.hostname = _self
  message.handle = nodes.get([_self,'handle'])
  nodes.set([_self,'load'],getLoad())
  message.load = nodes.get([_self,'load'])
  var spacepath = path.resolve(config.get('serve.dataRoot'))
  //Windows needs to call with only the drive letter
  if('win32' === os.platform()) spacepath = spacepath.substr(0,1)
  ds.check(spacepath,function(total,free){
    nodes.set([_self,'free'],parseInt(free,10) || 0)
    message.free = nodes.get([_self,'free'])
    multiCast.send(message,function(){
      setTimeout(sendAnnounce,config.get('mesh.interval'))
    })
  })
}
/*
//setup unicast UDP server (for direct messaging)
var uServer = dgram.createSocket('udp4')
uServer.bind(config.get('mesh.port'),function(){
  uServer.on('message',function(buf,rinfo){
    var sum = buf.readInt32BE(0)
    buf = buf.slice(4)
    if(sum !== crc32.signed(buf)){
      logger.warn('BAD CRC: ' + rinfo)
      return
    }
    var pkt = bencode.decode(buf)
    for(var k in pkt)
      if(pkt.hasOwnProperty(k) && Buffer.isBuffer(pkt[k]))
        pkt[k] = pkt[k].toString()
    //ignore ourselves
    if(pkt.handle === nodes.get([_self,'handle'])) return
    if(pkt.cmd){
      switch(pkt.cmd){
      case 'ANNOUNCE':
        uClient.sendPacket({})
        /* falls through */
/*
      case 'LIST':
        uClient.sendPacket({nodes: nodes.get()})
        break;
      default:
        logger.warn({msg:'UNKNOWN cmd',pkt:pkt})
        break;
      }
    }
  })
})

//setup unicast UDP client (replier)
var uClient = dgram.createSocket('udp4')
uClient.bind(function(){
  uClient.prototype.sendPacket = function(where,payload){
    var message = new ObjectManage(payload)
    message.set('hostname',_self)
    message.set('handle',nodes.get([_self,'handle']))
    message.set('sent',new Date().getTime())
    var pkt = bencode.encode(message)
    var buf = Buffer.concat([crc32(pkt),pkt])
    uClient.send(buf,0,buf.length,config.get('mesh.port'),findNodeIP(where))
  }
})
*/
sendAnnounce()
