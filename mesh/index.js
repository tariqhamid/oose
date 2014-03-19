'use strict';
var config = require('../config')
  , logger = require('../helpers/logger')
  , ObjectManage = require('object-manage')
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
  return ((val & 0xFF) << 24) | ((val & 0xFF00) << 8) | ((val >> 8) & 0xFF00) | ((val >> 24) & 0xFF)
}

//stateful node registry
var nodes = new ObjectManage({})
  , _self = config.get('hostname')
nodes.set([_self,'ip'],'127.0.0.2')
nodes.set([_self,'sig'],(new Date().getTime()) & 0xffffffff)
var int = os.networkInterfaces()
  , filter = function(d){
      if(('IPv4' !== d.family) || (d.internal)) return false
      nodes.set([_self,'ip'],d.address)
      return true
    }
for(var i in int) if(int.hasOwnProperty(i)) int[i].some(filter)
nodes.set([_self,'handle'],shortlink.encode(
  Math.abs(
    swap32(ip.toLong(nodes.get([_self,'ip'])))
    ^
    nodes.get([_self,'sig'])
  )
  & 0xffffffff
))

var cpuAverage = function(){
  var totalIdle = 0
    , totalTick = 0
  var cpus = os.cpus()
  for(var i=0,len=cpus.length; i<len; i++){
    for(var type in cpus[i].times) if(cpus[i].times.hasOwnProperty(type)) totalTick += cpus[i].times[type]
    totalIdle += cpus[i].times.idle
  }
  return {idle: totalIdle / cpus.length,  total: totalTick / cpus.length}
}
var lastMeasure = cpuAverage()
var getLoad = function(){
  var thisMeasure = cpuAverage()
  var percentageCPU = 100 - ~~(100 * (thisMeasure.idle - lastMeasure.idle) / (thisMeasure.total - lastMeasure.total))
  lastMeasure = thisMeasure
  return percentageCPU
}

//setup multicast server (listener)
var mServer = dgram.createSocket('udp4')
mServer.bind(config.get('serve.port'),function(){
  mServer.addMembership(config.get('mesh.address'))
  mServer.setMulticastTTL(config.get('mesh.ttl'))
  mServer.on('message',function(buf,rinfo){
    var sum = buf.readInt32BE(0)
    buf = buf.slice(4)
    if(sum !== crc32.signed(buf)){
      logger.warn('BAD CRC: ' + rinfo)
      return
    }
    var announce = bencode.decode(buf)
    for(var k in announce)
      if(announce.hasOwnProperty(k) && Buffer.isBuffer(announce[k]))
        announce[k] = announce[k].toString()
    //update nodes state in memory
    nodes.set([announce.hostname,'handle'],announce.handle)
    nodes.set([announce.hostname,'ip'],rinfo.address)
    nodes.set([announce.hostname,'load'],announce.load)
    nodes.set([announce.hostname,'free'],announce.free)
    nodes.set([announce.hostname,'sent'],announce.sent)
    logger.info(
      ((announce.handle === nodes.get([_self,'handle'])) ? '[SELFIE] ' : '') +
      announce.handle +
      ' posted an announce' +
      ' at ' + new Date(nodes.get([announce.hostname,'sent'])).toLocaleTimeString()
    )
    logger.info(nodes.get())
  })
})

//setup unicast server (for direct messaging)
var uServer = dgram.createSocket('udp4')
uServer.bind(config.get('serve.port'),function(){
  uServer.on('message',function(buf,rinfo){
    var sum = buf.readInt32BE(0)
    buf = buf.slice(4)
    if(sum !== crc32.signed(buf)){
      logger.warn('BAD CRC: ' + rinfo)
      return
    }
    var pkt = bencode.decode(buf)
    for(var k in pkt)
      if(pkt.hasOwnProperty(k) && pkt.isBuffer(pkt[k]))
        pkt[k] = pkt[k].toString()
    //ignore ourselves
    //if(pkt.handle === nodes.get([_self,'handle'])) return
  })
})

//setup multicast client (announcer)
var mClient = dgram.createSocket('udp4')
mClient.bind(function(){
  mClient.addMembership(config.get('mesh.address'))
  mClient.setMulticastTTL(config.get('mesh.ttl'))
  var messageTemplate = {
    hostname: _self,
    handle: nodes.get([_self,'handle']),
    sent: 0
  }
  var sendAnnounce = function(){
    var message = messageTemplate
    nodes.set([_self,'sent'],new Date().getTime())
    message.sent = nodes.get([_self,'sent'])
    nodes.set([_self,'load'],getLoad())
    message.load = nodes.get([_self,'load'])
    var spacepath = path.resolve(config.get('serve.dataRoot'))
    //Windows needs to call with only the drive letter
    if('win32' === os.platform()) spacepath = spacepath.substr(0,1)
    ds.check(spacepath,function(total,free){
      nodes.set([_self,'free'],parseInt(free,10) || 0)
      message.free = nodes.get([_self,'free'])
      var pkt = bencode.encode(message)
      var buf = Buffer.concat([crc32(pkt),pkt])
      mClient.send(buf,0,buf.length,config.get('serve.port'),config.get('mesh.address'))
      setTimeout(sendAnnounce,config.get('mesh.interval'))
    })
  }
  sendAnnounce()
})