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
    debug('UDP bound on ' + [host,port].join(':'))
    //add multicast membership if configured
    if(multicast && multicast.address){
      that.socket.setMulticastTTL(multicast.ttl || 1)
      that.socket.addMembership(multicast.address)
      debug('UDP also bound to mcast on ' + multicast.address)
    }
    /**
     * Bind listeners
     */
    //error handling
    that.socket.on('error',function(err){that.emit('error',err)})
    //message handling
    that.socket.on('message',function(packet,rinfo){
      var dup = that.tracker.track(packet,rinfo)
      //if the packet is duplicate just ignore it
      if(dup){
        debug('Duplicate packet ignored',rinfo)
        return
      }
      var payload = JSON.parse(amp.decode(packet))
      debug('got payload',payload.event)
      that.emit(payload.event,payload.message,rinfo)
    })
    done(null,that.socket)
  })
}


/**
 * Send an event to multicast
 * @param {string} event
 * @param {*} message
 * @param {function} done
 */
Multicast.prototype.send = function(event,message,done){
  var that = this
  var payload = {event: event, message: message}
  debug('payload ready for emission',event)
  var buff = amp.encode([new Buffer(JSON.stringify(payload))])
  that.socket.send(buff,0,buff.length,that.port,that.multicast.address,done)
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
