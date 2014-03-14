'use strict';
var bencode = require('bencode')
  , os = require('os')
  , ds = require('diskspace')
  , dgram = require('dgram')
  , program = require('commander')

program
  .version('0.0.1')
  .option('-h, --hostname <hostname>','Set process hostname, defaults to os hostname')
  .option('-m, --mcast <multicast ip>','Set multicast IP, default 226.0.0.1')
  .option('-v, --verbose','Turn on logging of registrations')
  .parse(process.argv)

var hostname = program.hostname || os.hostname()
var mulicastAddress = program.mcast || '226.0.0.1'

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
    console.log(rinfo)
  }
})
server.bind(3001,function(){
  server.addMembership(mulicastAddress)
  server.setMulticastTTL(255)
})

var sendHeartbeat = function(){
  var message = {
    hostname: hostname,
    load: os.loadavg().toString()
  }
  ds.check('C',function(total,free,status){
    console.log(total,free,status)
    message.free = free || 0
    message.sent = new Date().getTime()
    console.log(message)
    var buf = bencode.encode(message)
    var client = dgram.createSocket('udp4')
    client.bind(function(){
      client.addMembership(mulicastAddress)
      client.setMulticastTTL(255)
      client.send(buf,0,buf.length,3001,mulicastAddress)
    })
    setTimeout(sendHeartbeat,1000)
  })
}

sendHeartbeat()
