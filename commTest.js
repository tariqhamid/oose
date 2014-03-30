'use strict';
var net = require('net')
  , dgram = require('dgram')
  , bencode = require('bencode')

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
        who: {
          hostname: hostname,
          host: '127.0.0.1',
          port: multicastAddress.port
        }
      }
      buf = bencode.encode(JSON.stringify(response))
      multicast.send(buf,0,buf.length,message.tell.port,message.tell.host,function(){
        console.log('Sent UDP lookup response')
      })
    } else if('ping' === message.command){
      response = {
        command: 'ping'
      }
      buf = bencode.encode(JSON.stringify(response))
      multicast.send(buf,0,buf.length,message.tell.port,message.tell.host,function(){
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
      command: 'ping',
      tell: {
        host: '127.0.0.1',
        port: socket.address().port
      }
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
      sha1: sha1,
      tell: {
        host: '127.0.0.1',
        port: socket.address().port
      }
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
      who.push(message.who)
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

//-------------------------
//tcp
//-------------------------
var tcpServer = function(){
  var tcp = net.createServer()
  tcp.on('connection',function(socket){
    console.log('Got a TCP connection')
    var request = ''
    socket.setEncoding('utf-8')
    socket.on('readable',function(){
      var chunk
      while(null !== (chunk = socket.read())){
        request += chunk
      }
      //do some server stuff here
      request = JSON.parse(request)
      console.log(request)
      socket.write(JSON.stringify({command: 'lookup', sha1: request.sha1, hostname: 'blah12'}))
      socket.end()
    })
  })
  tcp.listen(9000,function(){
    console.log('TCP listening on 9000')
  })
}

var sha1LookupTCP = function(sha1,done){
  console.log('Sending TCP lookup')
  var response = ''
  var client = net.connect(9000)
  client.setEncoding('utf-8')
  client.on('readable',function(){
    var chunk
    while(null !== (chunk = client.read())){
      response += chunk
    }
    response = JSON.parse(response)
    console.log(response)
    done()
  })
  var message = {
    command: 'lookup',
    sha1: sha1
  }
  client.write(JSON.stringify(message))
}

tcpServer()
setTimeout(function(){
  sha1LookupTCP('foo',function(){
    console.log('got response')
    process.exit()
  })
},3000)
