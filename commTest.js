'use strict';
var net = require('net')
  , dgram = require('dgram')
  , bencode = require('bencode')
  , fs = require('fs')
  , stream = require('stream')

/*
//-------------------------
//udp
//-------------------------
var multicastAddress = {
  host: '224.0.0.110',
  port: 9000
}

var udpServer = function(hostname){
  var multicast = dgram.createSocket('udp4')
  multicast.bind(multicastAddress.port,function(){
    multicast.addMembership(multicastAddress.host,'127.0.0.1')
    console.log('UDP listening on ' + multicastAddress.port + ' with multicast on ' + multicastAddress.host)
  })
  multicast.on('message',function(packet,rinfo){
    var message = JSON.parse(bencode.decode(packet))
    var response, buf
    if('lookup' === message.command){
      //lets say we have the sha1 so we need to response
      response = {
        command: 'lookup',
        sha1: message.sha1,
        hostname: hostname
      }
      buf = bencode.encode(JSON.stringify(response))
      multicast.send(buf,0,buf.length,rinfo.port,rinfo.address,function(){
        console.log('Sent UDP lookup response')
      })
    } else if('ping' === message.command){
      response = {command: 'ping'}
      buf = bencode.encode(JSON.stringify(response))
      multicast.send(buf,0,buf.length,rinfo.port,rinfo.address,function(){
        //console.log('Send UDP ping response')
      })
    } else {
      //ignore the packet since we dont know the command
    }
  })
}

var ping = {}
var maxPing = function(){
  var max = 0
  for(var i in ping){
    if(ping.hasOwnProperty(i) && ping[i] > max){
      max = ping[i]
    }
  }
  return max
}
var pingHosts = function(){
  var start
  var socket = dgram.createSocket('udp4')
  socket.bind(function(){
    socket.addMembership(multicastAddress.host,'127.0.0.1')
    var message = {
      command: 'ping'
    }
    var buf = bencode.encode(JSON.stringify(message))
    socket.send(buf,0,buf.length,multicastAddress.port,multicastAddress.host,function(){
      start = new Date().getTime()
      setTimeout(pingHosts,1000)
    })
  })
  socket.on('message',function(packet,rinfo){
    var message = JSON.parse(bencode.decode(packet))
    if('ping' === message.command){
      ping[rinfo.address] = new Date().getTime() - start
    }
  })
}

//lets try a udp send and response kind of deal, we are going to encode with json
var sha1Lookup = function(sha1,done){
  //setup our receive
  var who = []
  var socket = dgram.createSocket('udp4')
  socket.bind(function(){
    socket.addMembership('224.0.0.110','127.0.0.1')
    var message = {
      command: 'lookup',
      sha1: sha1
    }
    var buf = bencode.encode(JSON.stringify(message))
    socket.send(buf,0,buf.length,multicastAddress.port,multicastAddress.host,function(){
      var windowSize = maxPing() * 2
      console.log('Sent UDP Lookup Request with a window size of ' + windowSize)
      console.log('Window size ')
      setTimeout(function(){
        done(who)
      },windowSize)
    })
  })
  //wait for the response here
  socket.on('message',function(packet,rinfo){
    var message = JSON.parse(bencode.decode(packet))
    if('lookup' === message.command && sha1 === message.sha1){
      who.push({
        hostname: message.hostname,
        address: rinfo.address,
        port: rinfo.port
      })
    }
  })
}

//wire up
udpServer('blah1')
udpServer('blah2')
udpServer('blah3')

//start pinging hosts too keep track of latency
console.log('Starting ping')
pingHosts()

//send request
setTimeout(function(){
  var sha1 = 'foo'
  sha1Lookup(sha1,function(who){
    console.log(who)
  })
},2000)
*/

//-------------------------
//tcp
//-------------------------
var tcpServer = function(onData){
  var tcp = net.createServer()
  tcp.on('connection',function(socket){
    console.log('Got a TCP connection')
    socket.once('readable',function(){
      var chunk = socket.read(2)
      var length = chunk.readUInt16BE(0)
      var command = JSON.parse(socket.read(length))
      onData(command,socket)
    })
  })
  tcp.listen(9000,function(){
    console.log('TCP listening on 9000')
  })
}

var tcpSendCommand = function(command,data){
  var client = net.connect(9000)
  command = JSON.stringify(command)
  var cbuf = new Buffer(command.length + 2)
  cbuf.writeInt16BE(command.length,0)
  cbuf.write(command,2)
  client.write(cbuf)
  if(data instanceof stream.Readable){
    console.log('piping in data')
    data.pipe(client)
  }
}

tcpServer(function(command,readable){
  readable.on('data',function(chunk){
    console.log(command,'Got a chunk with a length of ' + chunk.length)
  })
  readable.on('end',function(){
    console.log('done receiving command')
  })
})

setTimeout(function(){
  tcpSendCommand(
    {command: 'ping'},
    fs.createReadStream('./foo/foo.mp4')
  )
},1000)
