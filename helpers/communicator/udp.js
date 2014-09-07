'use strict';
var debug = require('debug')('oose:communicator:udp')
var dgram = require('dgram')
var EventEmitter = require('events').EventEmitter
var net = require('net')

var PacketTracker = require('./packetTracker')



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
  self.tracker = new PacketTracker()
  self.socket = dgram.createSocket(
    net.isIPv6(options.address) ? 'udp6' : 'udp4'
  )
  self.socket.bind(options.port,options.address,function(){
    if(options.multicast && options.multicast.address){
      self.socket.setMulticastTTL(options.multicast.ttl || 1)
      self.socket.addMembership(
        options.multicast.address,options.multicast.interfaceAddress || null
      )
    }
    debug(
        'UDP bound on ' +
        [options.address,options.port].join(':') +
        ((options.multicast && options.multicast.address) ? ' (multicast)' : '')
    )
    self.on('error',function(err){debug('UDP ERROR!',err)})
    self.emit('ready',self.socket)
  })
  self.socket.on('message',function(packet,rinfo){
    var dup = self.tracker.track(packet,rinfo)
    //if the packet is duplicate just ignore it
    if(dup){
      debug('Duplicate packet ignored',rinfo)
      return
    }
    var payload
    if(packet === null){
      debug(
          'Null packet received from ' + rinfo.address + ':' + rinfo.port
      )
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
    if(!self.options.multicast){
      throw new Error(
        'Tried to send a message without a destination with multicast disabled'
      )
    }
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
