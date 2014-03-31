'use strict';
var net = require('net')
  , dgram = require('dgram')
  , bencode = require('bencode')
  , fs = require('fs')

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
    var session = null
    socket.on('readable',function(){
      var chunk, maxRead = 4096, nextRead = 0
      if(!session){
        //grab the lengths which are the first 6 bytes
        chunk = socket.read(6)
        if(chunk){
          //start a new session and get the length
          session = {
            mode: 'command',
            command: {length: {read: 0,total: 0,nextRead: 0}, data: ''},
            data: {length: {read: 0, tota: 0, nextRead: 0}}
          }
          var commandLength = chunk.readUInt16BE(0)
          var dataLength = chunk.readUInt32BE(2)
          session.command.length.total = commandLength
          session.command.length.nextRead = commandLength
          session.data.length.total = dataLength
          session.data.length.nextRead = dataLength
        }
      }
      if(session && 'command' === session.mode){
        nextRead = session.command.length.nextRead < maxRead ? session.command.length.nextRead : maxRead
        while(null !== (chunk = socket.read(nextRead))){
          session.command.length.read += chunk.length
          session.command.length.nextRead = session.command.length.total - session.command.length.read
          session.command.data += chunk.toString()
        }
        if(!session.command.length.nextRead){
          session.command.data = JSON.parse(session.command.data)
          session.mode = 'data'
        }
      } else if(session && 'data' === session.mode){
        nextRead = session.data.length.nextRead < maxRead ? session.data.length.nextRead : maxRead
        while(null !== (chunk = socket.read(nextRead))){
          session.data.length.read += chunk.length
          session.data.length.nextRead = session.data.length.total - session.data.length.read
          onData(session.command.data,chunk)
        }
        if(!session.data.length.nextRead){
          console.log('Finished with command receive')
          session = null
        }
      }
      /*while(null !== (chunk = socket.read())){
        request += chunk
      }
      //do some server stuff here
      request = JSON.parse(request)
      console.log(request)
      socket.write(JSON.stringify({command: 'lookup', sha1: request.sha1, hostname: 'blah12'}))
      socket.end()*/
    })
  })
  tcp.listen(9000,function(){
    console.log('TCP listening on 9000')
  })
}

var tcpClientConn
var tcpClient = function(){
  tcpClientConn = net.connect(9000)
}

var tcpSendCommand = function(command,dataLength,data){
  command = JSON.stringify(command)
  var length = command.length
  var cbuf = new Buffer(length + 6)
  cbuf.writeInt16BE(length,0)
  cbuf.writeInt32BE(dataLength || 0,2)
  cbuf.write(command,6)
  tcpClientConn.write(cbuf)
  data.pipe(tcpClientConn)
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

tcpServer(function(command,data){
  console.log(command,'Got data with a length of ' + data.length)
})
tcpClient()

setTimeout(function(){
  tcpSendCommand(
    {command: 'ping'},
    fs.statSync('./foo/foo.mp4').size,
    fs.createReadStream('./foo/foo.mp4')
  )
  //sha1LookupTCP('foo',function(){
  //  console.log('got response')
  //  process.exit()
  //})
},1000)
