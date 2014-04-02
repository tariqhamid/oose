'use strict';
var net = require('net')
  , dgram = require('dgram')
  , stream = require('stream')
  , EventEmitter = require('events').EventEmitter

var build = function(command,message){
  return new Buffer(JSON.stringify({
    command: command,
    seq: new Date().getTime(),
    message: message
  }))
}

var parse = function(packet){
  return JSON.parse(packet.toString())
}



/**
 * UDP Communicator
 * @param {object} options
 * @constructor
 */
var UDP = function(options){
  var self = this
  EventEmitter.call(self)
  if('object' !== typeof options) options = {}
  if(!options.port) throw new Error('Port required to setup UDP')
  self.options = options
  self.socket = dgram.createSocket(net.isIPv6(options.address) ? 'udp6' : 'udp4')
  self.socket.bind(options.port,options.address,function(){
    if(options.multicast && options.multicast.address){
      self.socket.setMulticastTTL(options.multicast.ttl || 1)
      self.socket.addMembership(options.multicast.address,options.multicast.interfaceAddress || null)
    }
    self.emit('ready',self.socket)
  })
  self.socket.on('message',function(packet,rinfo){
    var payload = parse(packet)
    self.emit(payload.command,payload.message,rinfo)
  })
  self.socket.on('error',function(err){self.emit('error',err)})
}
UDP.prototype = Object.create(EventEmitter.prototype)


/**
 * UDP.send()
 * @param {string} command Command to send
 * @param {object} message Additional message/command parameters
 * @param {number} port Destination port
 * @param {string} address Destination address (or multicast address)
 * @param {function} done Callback (optional)
 */
UDP.prototype.send = function(command,message,port,address,done){
  var self = this
  if(!command) throw new Error('Tried to send a message without a command')
  //missing port? must be directed towards multicast
  if(!port || !address || 'function' === typeof port){
    if(!self.options.multicast)
      throw new Error('Tried to send a message without a destination with multicast disabled')
    done = port
    port = self.options.port
    address = self.options.multicast.address
  }
  var packet = build(command,message)
  self.socket.send(packet,0,packet.length,port,address,done)
}


/**
 * Close the UDP handler and stop listening on the bound port
 * @param {function} done
 */
UDP.prototype.close = function(done){
  this.socket.close(done)
}



/**
 * TCP Communicator
 * @param {object} options
 * @constructor
 */
var TCP = function(options){
  var self = this
  EventEmitter.call(self)
  if('object' !== typeof options) options = {}
  if(!options.port) throw new Error('Port required to setup TCP')
  self.options = options
  self.server = net.createServer()
  self.server.on('connection',function(socket){
    socket.once('readable',function(){
      var length = socket.read(2).readUInt16BE(0)
      var payload = parse(socket.read(length))
      if(!payload) return self.emit('error','Failed to parse payload')
      self.emit(payload.command,payload.message,socket)
    })
    socket.on('error',function(err){self.emit('error',err)})
  })
  self.server.on('error',function(err){self.emit('error',err)})
  self.server.listen(options.port,options.address,function(){
    self.emit('ready',self.server)
  })
}
TCP.prototype = Object.create(EventEmitter.prototype)


/**
 * TCP.send()
 * @param {string} command Command to send
 * @param {object} message Additional message/command parameters
 * @param {number} port Destination port
 * @param {string} address Destination address (or multicast address)
 * @param {stream} readable Optional stream to deliver after command
 * @return {net.socket}
 */
TCP.prototype.send = function(command,message,port,address,readable){
  var self = this
  if(!address) throw new Error('Tried to send a TCP message without an address')
  if(!port) throw new Error('Tried to send a TCP message without a port')
  var payload = build(command,message)
  var buf = Buffer.concat([new Buffer(2).writeUInt16BE(payload.length),payload])
  var client = net.connect(port,address)
  client.on('error',function(err){self.emit('error',err)})
  client.write(buf)
  if(readable instanceof stream.Readable){
    readable.pipe(client)
  }
  return client
}


/**
 * Close the TCP server
 * @param {function} done
 */
TCP.prototype.close = function(done){
  this.server.close(done)
}



/**
 * export UDP Convenience Constructor
 * @param {object} options
 * @return {UDP}
 * @constructor
 */
exports.UDP = function(options){return new UDP(options)}



/**
 * export TCP Convenience Constructor
 * @param {object} options
 * @return {TCP}
 * @constructor
 */
exports.TCP = function(options){return new TCP(options)}
