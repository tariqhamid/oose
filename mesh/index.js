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
var getLocalIP = function(){
  var rv = '127.0.0.2'
  var int = os.networkInterfaces()
  for(var i in int)
    int[i].forEach(function(d){
      if(('IPv4' === d.family) && (!d.internal)) rv = d.address
    })
  return rv
}

var swap32 = function swap32(val){
  return ((val & 0xFF) << 24) | ((val & 0xFF00) << 8) | ((val >> 8) & 0xFF00) | ((val >> 24) & 0xFF)
}

var session = {
  ip: ip.toLong(getLocalIP()),
  sig: (new Date().getTime()) & 0xffffffff
}
var getHostHandle = function(){
  return shortlink.encode(Math.abs(swap32(session.ip) ^ session.sig) & 0xffffffff)
}

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
  mServer.on('message',function(buf){
    var sum = buf.readInt32BE(0)
    buf = buf.slice(4)
    if(sum != crc32.signed(buf))
      console.log("BAD CRC")
    var announce = bencode.decode(buf)
    for(var k in announce)
      if(Buffer.isBuffer(announce[k]))
        announce[k] = announce[k].toString()
    //ignore ourselves
    if(announce.hostname === config.get('hostname')) return
    logger.info(
      announce.hostname +
        ' posted a announce' +
        ' at ' + announce.sent +
        ':[' +
        'load:' + announce.load +
        '/' +
        'free:' + announce.free / 1024 +
        ']'
    )
  })
})

//setup unicast server (for direct messaging)
var uServer = dgram.createSocket('udp4')
uServer.bind(config.get('serve.port'),function(){
  uServer.on('message',function(buf){
    var sum = buf.readInt32BE(0)
    buf = buf.slice(4)
    if(sum != crc32.signed(buf))
      console.log("BAD CRC")
    var announce = bencode.decode(buf)
    for(var k in announce)
      if(Buffer.isBuffer(announce[k]))
        announce[k] = announce[k].toString()
    //ignore ourselves
    if(announce.hostname === config.get('hostname')) return
    logger.info(
      announce.hostname +
        ' posted a announce' +
        ' at ' + announce.sent +
        ':[' +
        'load:' + announce.load +
        '/' +
        'free:' + announce.free / 1024 +
        ']'
    )
  })
})

//setup multicast client (announcer)
var mClient = dgram.createSocket('udp4')
mClient.bind(function(){
  mClient.addMembership(config.get('mesh.address'))
  mClient.setMulticastTTL(config.get('mesh.ttl'))
  var messageTemplate = {
    hostname: config.get('hostname'),
    hostkey: getHostHandle(),
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
      console.log(message)
      var pkt = bencode.encode(message)
      var buf = Buffer.concat([crc32(pkt),pkt])
      mClient.send(buf,0,buf.length,config.get('serve.port'),config.get('mesh.address'))
      setTimeout(sendAnnounce,config.get('mesh.interval'))
    })
  }
  sendAnnounce()
})