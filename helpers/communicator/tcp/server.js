'use strict';
var debug = require('debug')('oose:communicator:tcp:server')
var EventEmitter = require('events').EventEmitter
var net = require('net')

var util = require('../util')



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
    socket.safeRead = util.safeRead.bind(socket)
    var badPacket = function(msg){
      self.emit(
        'error',
          msg + ': ' + socket.remoteAddress +
          ':' + socket.remotePort
      )
    }
    socket.once('readable',function(){
      var magic = socket.safeRead(4)
      if(!magic || 'OOSE' !== magic.toString())
        return badPacket('Not an OOSE packet')
      var lengthRaw = socket.safeRead(2)
      if(!lengthRaw)
        return badPacket('Invalid socket data')
      var length = lengthRaw.readUInt16BE(0)
      var payload = util.parse(socket.safeRead(length))
      if(!payload) return self.emit('error','Failed to parse payload')
      self.emit(payload.command,payload.message,socket)
    })
    socket.on('error',function(err){self.emit('error',err)})
  })
  self.server.on('error',function(err){self.emit('error',err)})
  self.server.listen(options.port,options.address,function(){
    debug(
        'TCP listener bound on ' +
        [options.address,options.port].join(':')
    )
    self.on('error',function(err){debug('TCP ERROR!',err)})
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
