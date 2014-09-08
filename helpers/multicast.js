'use strict';
var amp = require('amp')
var debug = require('debug')('oose:multicast')
var dgram = require('dgram')
var EventEmitter = require('events').EventEmitter
var ObjectManage = require('object-manage')

var PacketTracker = require('./packetTracker')



/**
 * Mulicast helper
 * @param {object} options
 * @constructor
 */
var Multicast = function(options){
  var that = this
  EventEmitter.call(that)
  //setup options
  that.options = new ObjectManage(that.defaultOptions)
  that.options.$load(options)
  //setup the packet tracker
  that.tracker = new PacketTracker()
}
Multicast.prototype = Object.create(EventEmitter.prototype)


/**
 * Bind to a UDP port
 * @param {number} port
 * @param {*} host
 * @param {object} multicast setting
 * @param {function} done called when bound
 */
Multicast.prototype.bind = function(port,host,multicast,done){
  var that = this
  //assign call values to base object
  that.port = port
  that.host = host
  that.multicast = multicast
  //setup the socket
  that.socket = dgram.createSocket('udp4')
  //bind to the port and host
  that.socket.bind(port,host,function(){
    //add multicast membership if configured
    if(multicast && multicast.host){
      that.socket.setMulticastTTL(multicast.ttl || 1)
      that.socket.addMembership(
        multicast.address,multicast.interfaceAddress || null
      )
    }
    debug('UDP bound on ' + [host,port].join(':'))
    if(multicast && multicast.address)
      debug('UDP also bound to ' + [multicast.address,multicast.port].join(':'))
    //bind listeners
    that.socket.on('error',function(err){that.emit('error',err)})
    that.socket.on('message',function(packet,rinfo){
      var dup = that.tracker.track(packet,rinfo)
      //if the packet is duplicate just ignore it
      if(dup){
        debug('Duplicate packet ignored',rinfo)
        return
      }
      var payload = amp.decode(packet)
      that.emit(payload.command,payload.message,rinfo)
    })
    that.emit('ready',that.socket)
    done(null,that.socket)
  })
}


/**
 * UDP.send()
 * @param {string} command Command to send
 * @param {object} message Additional message/command parameters
 * @param {function} done Callback (optional)
 * @return {*}
 */
Multicast.prototype.send = function(command,message,done){
  var that = this
  if(!command) return done('Tried to send a message without a command')
  if(!that.multicast.port) return done('Multicast not configured')
  var packet = amp.encode({command: command, message: message})
  var socket = dgram.create('udp4')
  socket.send(
    packet,
    0,
    packet.length,
    that.mulicast.port,
    that.mulicast.address,
    done
  )
}


/**
 * Static UDP.send()
 * @param {string} command Command to send
 * @param {object} message Additional message/command parameters
 * @param {number} port Destination port
 * @param {string} address Destination address (or multicast address)
 * @param {function} done Callback (optional)
 * @return {*}
 */
Multicast.send = function(command,message,port,address,done){
  if(!command) return done('Tried to send a message without a command')
  var packet = amp.encode({command: command, message: message})
  var socket = dgram.create('udp4')
  socket.send(packet,0,packet.length,port,address,done)
}


/**
 * Close the UDP handler and stop listening on the bound port
 * @param {function} done
 */
Multicast.prototype.close = function(done){
  this.socket.close(done)
}


/**
 * Multicast helper
 * @type {Multicast}
 */
module.exports = Multicast
