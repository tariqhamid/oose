'use strict';
//mesh socket object
var ObjectManage = require('object-manage')
  , bencode = require('bencode')
  , crc32 = require('buffer-crc32')
  , EventEmitter = require('events').EventEmitter
  , util = require('util')
  , dgram = require('dgram')
  , async = require('async')

/**
 * Encode an object to be sent
 * @param obj
 */
var encode = function(obj){
  var pkt = bencode.encode(obj)
  return Buffer.concat([crc32(pkt),pkt])
}

/**
 * Decode a buffer and explode into an object
 * @param buf
 */
var decode = function(buf){
  var pkt = bencode.decode(buf)
  for(var k in pkt)
    if(pkt.hasOwnProperty(k) && Buffer.isBuffer(pkt[k]))
      pkt[k] = pkt[k].toString()
  return pkt
}

/**
 * Communicator constructor, accepts options
 * @param options
 * @constructor
 */
var Communicator = function(options){
  var self = this
  //init event emitter
  EventEmitter.call(self)
  //setup options
  self.options = new ObjectManage(self.optionSchema)
  self.options.load(options)
  self.socket = null

  var setup = {
    udp4: function(){
      self.socket = dgram.createSocket('udp4')
    },
    mcast: setup.udp4,
    tcp4: function(){
      self.emit('error','TCP not yet supported')
    }
  }
  //define the recv and xmit sockets
  setup[self.options.get('proto')]()

  //bind the socket, setup to parse messages and fire receive event on incoming
  self.socket.bind(self.options.get('port'),function(){
    //add multicast membership if needed
    if('mcast' === self.options.get('proto')){
      self.socket.addMembership(self.options.get('mcast.address'))
      self.socket.setMulticastTTL(self.options.get('mcast.ttl'))
    }
    self.socket.on('message',function(buf,rinfo){
      var sum = buf.readInt32BE(0)
      buf = buf.slice(4)
      if(sum !== crc32.signed(buf)){
        self.emit('warning','BAD CRC: ' + rinfo)
      } else {
        var pkt = decode(buf)
        pkt.rinfo = rinfo
        //run middleware
        async.eachSeries(self.middleware.receive,function(fn,next){fn(pkt,next)},function(err){
          if(err) self.emit('error',err)
          else self.emit('receive',pkt)
        })
      }
    })
  })
}
util.inherits(Communicator,EventEmitter)

/**
 * Configuration Defaults
 * @type {{proto: string, mcast: {address: null, ttl: number}, address: string, port: number}}
 */
Communicator.prototype.optionSchema = {
  proto: 'udp4',
  mcast: {address: null, ttl: 1},
  address: '127.0.0.1',
  port: 3333
}

Communicator.prototype.middleware = {
  send: [],
  receive: []
}

/**
 * Add send of receive middleware
 * @param position  Position of the middleware either send or receive
 * @param fn
 */
Communicator.prototype.use = function(position,fn){
  var self = this
  if('function' === typeof position){
    fn = position
    position = 'receive'
  }
  if('send' !== position || 'receive' !== position) position = 'receive'
  self.middleware[position].push(fn)
}

/**
 * Shortcut to add send middleware
 * @param fn
 */
Communicator.prototype.useSend = function(fn){
  this.use('send',fn)
}

/**
 * Shortcut to add receive middleware
 * @param fn
 */
Communicator.prototype.useReceive = function(fn){
  this.use('receive',fn)
}

/**
 * Send a payload via the socket
 * @param payload  Message to be sent, either object or string
 * @param done  Callback when message is sent
 */
Communicator.prototype.send = function(payload,done){
  var self = this
  if('string' === typeof payload) payload = {message: payload}
  if('object' !== typeof payload) done('Invalid payload type, must be string or object')
  else {
    var message = new ObjectManage(payload)
    if(!message.exists('hostname')) message.set('hostname',self.options.get('hostname'))
    if(!message.exists('handle')) message.set('handle',self.options.get('handle'))
    if(!message.exists('sent')) message.set('sent',new Date().getTime())
    //run middleware
    async.eachSeries(self.middleware.send,function(fn,next){fn(message,next)},function(err){
      if(err) done(err)
      else{
        var buf = encode(message.get())
        self.socket.send(buf,0,buf.length,self.options.port,self.options.address,done)
      }
    })
  }
}

module.exports = Communicator