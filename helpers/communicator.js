'use strict';
var net = require('net')
var dgram = require('dgram')
var stream = require('stream')
var logger = require('../helpers/logger').create('communicator')
var EventEmitter = require('events').EventEmitter


/**
 * Static utility functions
 * @type {{}}
 */
var util = {}


/**
 * Build packet
 * @param {string} command
 * @param {object} message
 * @return {Buffer}
 */
util.build = function(command,message){
  return new Buffer(JSON.stringify({
    command: command,
    seq: new Date().getTime(),
    message: message
  }))
}


/**
 * Parse packet
 * @param {Buffer} packet
 * @return {object}
 */
util.parse = function(packet){
  if(packet instanceof Buffer)
    packet = packet.toString()
  return JSON.parse(packet)
}


/**
 * Wrap the packet with the payload length and return a new buffer
 * @param {Buffer} payload
 * @return {Buffer}
 */
util.withLength = function(payload){
  var length = new Buffer(2)
  length.writeUInt16BE(payload.length,0)
  return Buffer.concat([length,payload])
}


/**
 * TCP.send()
 * @param {string} command Command to send
 * @param {object} message Additional message/command parameters
 * @param {number} port Destination port
 * @param {string} address Destination address (or multicast address)
 * @param {stream} readable Optional stream to deliver after command
 * @return {net.socket}
 */
util.tcpSend = function(command,message,port,address,readable){
  if(!port) throw new Error('Tried to send a TCP message without a port')
  var payload = util.withLength(util.build(command,message))
  var client = net.connect(port,address || '127.0.0.1')
  client.on('connect',function(){
    client.write(payload)
    if(readable instanceof stream.Readable){
      readable.pipe(client)
    }
  })
  return client
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
    var payload
    if(packet === null){
      logger.warn('Null packet received from ' + rinfo.address + ':' + rinfo.port)
      payload = {}
    } else {
      payload = util.parse(packet)
    }
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
  var packet = util.build(command,message)
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
      var lengthRaw = socket.read(2)
      if(!lengthRaw) return self.emit('error','Invalid socket data ' + socket.remoteAddress + ':' + socket.remotePort)
      var length = lengthRaw.readUInt16BE(0)
      var payload = util.parse(socket.read(length))
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
 * TCP send utility
 * @type {Function}
 */
TCP.prototype.send = util.tcpSend


/**
 * Close the TCP server
 * @param {function} done
 */
TCP.prototype.close = function(done){
  this.server.close(done)
}


/**
 * Utility functions
 * @type {{}}
 */
exports.util = util



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
