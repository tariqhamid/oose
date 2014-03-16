'use strict';
var config = require('../config')
  , logger = require('../helpers/logger')
  , program = require('commander')
  , os = require('os')
  , ds = require('diskspace')
  , bencode = require('bencode')
  , dgram = require('dgram')
  , path = require('path')

//setup server side (listener)
var server = dgram.createSocket('udp4')
server.on('message',function(buf){
  var announce = bencode.decode(buf)
  //ignore ourselves
  if(announce.hostname.toString() === config.get('hostname')) return
  if(program.verbose){
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
  }
})
server.bind(config.get('serve.port'),function(){
  server.addMembership(config.get('mesh.address'))
  server.setMulticastTTL(config.get('mesh.ttl'))
})

//setup client side (announcer)
var client = dgram.createSocket('udp4')
client.bind(function(){
  client.addMembership(config.get('mesh.address'))
  client.setMulticastTTL(config.get('mesh.ttl'))
})

var getLoad = function(){
  if('win32' === os.platform()){
    require('windows-cpu').totalLoad(function(err, res){
      var sum = 0
      res.forEach(function(x){sum += x})
      return sum / res.length
    })
  } else {
    var load = {
      user: 0,
      nice: 0,
      sys: 0,
      idle: 0,
      irq: 0
    }
    os.cpus().forEach(function(x){
      for(var y in x.times) load[y] += x.times[y]
    })
    return (load.user + load.nice + load.sys) / load.idle * 100
  }
}

var sendAnnounce = function(){
  var message = {
    hostname: config.get('hostname'),
    load: os.loadavg().toString() //getLoad()
  }
  var spacepath = path.resolve(config.get('serve.dataRoot'))
  if('win32' === os.platform()) spacepath = spacepath.substr(0,1)
  ds.check(spacepath,function(total,free){
    message.free = free || 0
    message.sent = new Date().getTime()
    console.log(message)
    var buf = bencode.encode(message)
    client.send(buf,0,buf.length,config.get('serve.port'),config.get('mesh.address'))
    setTimeout(sendAnnounce,config.get('mesh.interval'))
  })
}

sendAnnounce()