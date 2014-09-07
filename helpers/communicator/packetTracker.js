'use strict';
var crc32 = require('buffer-crc32')
var debug = require('debug')('oose:communicator:packetTracker')



/**
 * Track packets and deny duplicates
 * @constructor
 */
var PacketTracker = function(){
  this.packets = []
}


/**
 * Track a packet signature
 * @param {Buffer} buff
 * @param {object} rinfo
 * @param {Number} ttl
 * @return {boolean} returns true if the packet already exists
 */
PacketTracker.prototype.track = function(buff,rinfo,ttl){
  ttl = ttl || 500
  var that = this
  //merge the buffer with the rinfo
  var sig = crc32.signed(
    Buffer.concat([buff,new Buffer(JSON.stringify(rinfo))])
  )
  debug(sig,'got packet')
  //check if the packet exists, if not add it
  if(-1 !== that.packets.indexOf(sig)){
    debug(sig,'duplicate packet, ignoring')
    return true
  }
  debug(sig,'packet now being tracked for ' + ttl + 'ms')
  that.packets.push(sig)
  setTimeout(function(){
    that.packets.splice(that.packets.indexOf(sig),1)
    debug(sig,'removed from tracking')
  },ttl)
  return false
}
