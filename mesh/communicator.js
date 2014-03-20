'use strict';
//mesh socket object
var ObjectManage = require('object-manage')
  , bencode = require('bencode')
  , crc32 = require('buffer-crc32')

function Communicator(options,callbacks){
  this.options = new ObjectManage({
    logger: null,
    proto: 'udp4',
    mcast: {address: null, ttl: 1},
    address: '127.0.0.1',
    port: 3333
  })
  this.options.load(options)
  this.socket = null
  this.callbacks = callbacks || {
    bind: [],
    recv: [],
    xmit: []
  }
  this.callbackReturnValues = {
    bind: [],
    recv: [],
    xmit: []
  }
  //define the recv and xmit sockets
  switch(this.options.proto){
  case 'udp4':
  case 'mcast':
    var dgram = require('dgram')
    this.socket = dgram.createSocket('udp4')
    if('mcast' === this.options.proto)
      //push the bind callback for multicast setup
      this.callbacks.bind.shift(function(){
        this.socket.addMembership(this.options.mcast.address)
        this.socket.setMulticastTTL(this.options.mcast.ttl)
        return true
      }.bind(this))
    break
  case 'tcp4':
    //TODO some tcp majiks
    break
  }

  this.socket.bind(this.options.port,function(){
    this.callbacks.bind.some(function(cb){
      return this.callbackReturnValues.bind.push(cb())
    }.bind(this))
    this.socket.on('message',function(buf,rinfo){
      var sum = buf.readInt32BE(0)
      buf = buf.slice(4)
      if(sum !== crc32.signed(buf)){
        if(this.options.exists('logger'))
          this.options.logger.warn('BAD CRC: ' + rinfo)
        return false
      }
      var pkt = bencode.decode(buf)
      for(var k in pkt)
        if(pkt.hasOwnProperty(k) && Buffer.isBuffer(pkt[k]))
          pkt[k] = pkt[k].toString()
      pkt.rinfo = rinfo
      this.callbacks.recv.some(function(cb){
        return this.callbackReturnValues.recv.push(cb(pkt))
      }.bind(this))
    }.bind(this))
  }.bind(this))
}

Communicator.prototype.sendPacket = function(payload){
  var message = new ObjectManage(payload)
  if(!message.exists('hostname')) message.set('hostname',this.options.hostname)
  if(!message.exists('handle')) message.set('handle',this.options.handle)
  if(!message.exists('sent')) message.set('sent',new Date().getTime())
  var pkt = bencode.encode(message)
  var buf = Buffer.concat([crc32(pkt),pkt])
  this.socket.send(buf,0,buf.length,this.options.port,this.options.address)
}

module.exports = Communicator