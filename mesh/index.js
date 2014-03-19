'use strict';
var config = require('../config')
  , logger = require('../helpers/logger')
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
var nodes = {}
  , _self = config.get('hostname')
nodes[_self] = {
  ip: '127.0.0.2',
  sig: (new Date().getTime()) & 0xffffffff
}
var int = os.networkInterfaces()
for(var i in int) int[i].some(function(d){
  if(('IPv4' !== d.family) || (d.internal))
    return false
  nodes[_self].ip = d.address
  return true
})
nodes[_self].handle = shortlink.encode(Math.abs(swap32(ip.toLong(nodes[_self].ip)) ^ nodes[_self].sig) & 0xffffffff)

var cpuAverage = function(){
  var totalIdle = 0
    , totalTick = 0
  var cpus = os.cpus()
  for(var i=0,len=cpus.length; i<len; i++){
    for(var type in cpus[i].times) totalTick += cpus[i].times[type]
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
      logger.warn("BAD CRC",rinfo)
      return
    }
    var announce = bencode.decode(buf)
    for(var k in announce)
      if(Buffer.isBuffer(announce[k]))
        announce[k] = announce[k].toString()
    logger.info(
      ((announce.handle === nodes[_self].handle) ? '[SELFIE] ' : '') +
      announce.handle +
        ' posted an announce' +
        ' at ' + new Date(announce.sent).toLocaleTimeString() +
        ' => [' +
        'hostname:' + announce.hostname +
        '|' +
        'load:' + announce.load +
        '|' +
        'free:' + announce.free / 1024 +
        ']'
    )
  })
})

//setup unicast server (for direct messaging)
var uServer = dgram.createSocket('udp4')
uServer.bind(config.get('serve.port'),function(){
  uServer.on('message',function(buf,rinfo){
    var sum = buf.readInt32BE(0)
    buf = buf.slice(4)
    if(sum !== crc32.signed(buf)){
      logger.warn("BAD CRC",rinfo)
      return
    }
    var pkt = bencode.decode(buf)
    for(var k in pkt)
      if(Buffer.isBuffer(pkt[k]))
        pkt[k] = pkt[k].toString()
    //ignore ourselves
    if(pkt.handle === nodes[_self].handle) return
  })
})

//setup multicast client (announcer)
var mClient = dgram.createSocket('udp4')
mClient.bind(function(){
  mClient.addMembership(config.get('mesh.address'))
  mClient.setMulticastTTL(config.get('mesh.ttl'))
  var messageTemplate = {
    hostname: _self,
    handle: nodes[_self].handle,
    sent: 0
  }
  var sendAnnounce = function(){
    var message = messageTemplate
    message.load = getLoad()
    var spacepath = path.resolve(config.get('serve.dataRoot'))
    //Windows needs to call with only the drive letter
    if('win32' === os.platform()) spacepath = spacepath.substr(0,1)
    ds.check(spacepath,function(total,free){
      message.free = parseInt(free,10) || 0
      message.sent = new Date().getTime()
      var pkt = bencode.encode(message)
      var buf = Buffer.concat([crc32(pkt),pkt])
      mClient.send(buf,0,buf.length,config.get('serve.port'),config.get('mesh.address'))
      setTimeout(sendAnnounce,config.get('mesh.interval'))
    })
  }
  sendAnnounce()
})