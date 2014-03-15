'use strict';
var config = require('../config')
  , program = require('commander')
  , os = require('os')
  , fs = require('fs')
  , mkdirp = require('mkdirp')
  , ds = require('diskspace')
  , bencode = require('bencode')
  , dgram = require('dgram')

//set defaults
var DFL = {
  dataRoot: config.get('serve.dataRoot') || './data/serve',
  hostname: config.get('serve.hostname') || os.hostname(),
  port: config.get('serve.port') || 3000,
  mcastAddress: config.get('serve.mcastAddress') || '226.0.0.1',
  mcastTTL: config.get('serve.mcastTTL') || 2,
  mcastInterval: config.get('serve.mcastInterval') || 1000
}

//read command line overrides
program
  .version('0.0.1')
  .option('-r, --dataRoot <storage path>','Set storage path, default [' + DFL.dataRoot + ']')
  .option('-h, --hostname <hostname>','Set process hostname, default [' + DFL.hostname + ']')
  .option('-p, --port <listen port>','Set listen port, default [' + DFL.port + ']')
  .option('-m, --mcastAddress <multicast IP>','Set multicast IP, default [' + DFL.mcastAddress + ']')
  .option('-t, --mcastTTL <TTL>','Set multicast TTL (1-255), default [' + DFL.mcastTTL + ']')
  .option('-i, --mcastInterval <msec>','Set multicast announcement interval in milliseconds, default [' + DFL.mcastInterval + ']')
  .option('-v, --verbose','Turn on logging of registrations')
  .parse(process.argv)

var dataRoot = program.dataRoot || DFL.dataRoot
  , hostname = program.hostname || DFL.hostname
  , port = program.port || DFL.port
  , mcastAddress = program.mcastAddress || DFL.mcastAddress
  , mcastInterval = program.mcastInterval || DFL.mcastInterval
  , mcastTTL = program.mcastTTL || DFL.mcastTTL

//make sure the root folder exists
if(!fs.existsSync(dataRoot)){
  mkdirp.sync(dataRoot)
}

//setup server side (listener)
var server = dgram.createSocket('udp4')
server.on('message',function(buf,rinfo){
  var heartbeat = bencode.decode(buf)
  //ignore ourselves
  if(heartbeat.hostname.toString() === hostname) return
  if(program.verbose){
    console.log(
      heartbeat.hostname +
      ' posted a heartbeat' +
      ' at ' + heartbeat.sent +
      ':[' +
      'load:' + heartbeat.load +
      '/' +
      'free:' + heartbeat.free / 1024 +
      ']'
    )
  }
})
server.bind(port,function(){
  server.addMembership(mcastAddress)
  server.setMulticastTTL(mcastTTL)
})


//setup client side (announcer)
var client = dgram.createSocket('udp4')
client.bind(function(){
  client.addMembership(mcastAddress)
  client.setMulticastTTL(mcastTTL)
})

var sendHeartbeat = function(){
  var message = {
    hostname: hostname,
    load: os.loadavg().toString()
  }
  ds.check(dataRoot,function(total,free,status){
    message.free = free || 0
    message.sent = new Date().getTime()
    console.log(message)
    var buf = bencode.encode(message)
    client.send(buf,0,buf.length,port,mcastAddress)
    setTimeout(sendHeartbeat,mcastInterval)
  })
}

sendHeartbeat()