'use strict';
//mesh socket object
var ObjectManage = require('object-manage')
  , util = require('util')
  , async = require('async')
  , dgram = require('dgram')
  , net = require('net')
  , EventEmitter = require('events').EventEmitter


/**
 * Encode an object to be sent
 * @param {object} obj
 * @return {buffer}
 */
var encode = function(obj){
  return new Buffer(JSON.stringify(obj))
}


/**
 * Decode a buffer and explode into an object
 * @param {buffer} buf
 * @return {object} Decoded Object, or false on failure
 */
var decode = function(buf){
  var pkt = JSON.parse(buf)
  for(var k in pkt)
    if(pkt.hasOwnProperty(k) && Buffer.isBuffer(pkt[k]))
      pkt[k] = pkt[k].toString()
  return pkt
}



/**
 * Communicator constructor, accepts options
 * @constructor
 * @param {object} options
 */
var Communicator = function(options){
  var self = this
  //init event emitter
  EventEmitter.call(self)
  //setup options
  self.options = new ObjectManage({
    proto: 'udp4',
    mcast: {address: null, ttl: 1},
    address: null,
    port: 3333
  })
  self.options.load(options)
  self.middleware = {
    send: [],
    receive: []
  }
  self.socket = null

  var setup = {
    udp4: function(){
      self.socket = dgram.createSocket('udp4')
    },
    mcast: function(){
      self.socket = dgram.createSocket('udp4')
    },
    tcp4listen: function(){
      self.socket = net.createServer()
    },
    tcp4connect: function(){
      self.socket = net.createConnection()
    }
  }
  //define the recv and xmit sockets
  setup[self.options.get('proto')]()

  var middlewareReceive = function(res){
    //run middleware
    async.eachSeries(self.middleware.receive,
      function(fn,next){fn(res,next)},function(err){
        if(err) self.emit('error',err)
        else self.emit('receive',res)
      }
    )
  }

  if(self.socket instanceof dgram.Socket){
    //bind the socket, setup to parse messages and fire receive event on incoming
    self.socket.bind(self.options.get('port'),function(){
      //add multicast membership if needed
      if('mcast' === self.options.get('proto')){
        self.socket.addMembership(self.options.get('mcast.address'))
        self.socket.setMulticastTTL(self.options.get('mcast.ttl'))
        self.options.set('address',self.options.get('mcast.address'))
      }
      self.socket.on('message',function(buf,rinfo){
        var res = decode(buf)
        res.rinfo = rinfo
        middlewareReceive(res)
      })
    })
  }

  if(self.socket instanceof net.Server){ // this is a TCP listener
    self.socket.on('connection',function(socket){
      var remoteAddress = socket.remoteAddress
      var remotePort = socket.remotePort
      var buf
      self.emit('info','Received TCP connection from ' + remoteAddress + ':' + remotePort)
      socket.on('data',function(data){
        if(buf instanceof Buffer){
          buf = Buffer.concat([buf,data])
        } else {
          buf = data
        }
      })
      socket.on('close',function(failed){
        if(failed) self.emit('warning','There was an error in the TCP message from ' + remoteAddress + ':' + remotePort)
        else {
          self.emit('info','Closed connection from ' + remoteAddress + ':' + remotePort)
          var res = decode(buf)
          res.rinfo = {
            family: 'IPv4',
            address: remoteAddress,
            port: remotePort,
            size: socket.bytesReceived
          }
          middlewareReceive(res)
        }
      })
    })
    self.socket.listen(self.options.get('port'))
  }
}
util.inherits(Communicator,EventEmitter)


/**
 * Add middleware
 * @param {string} position  Position of the middleware either send or receive
 * @param {function} fn
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
 * Send a payload via the socket
 * @param {object} payload Message to be sent, string input tolerated
 * @param {function} done Callback when message is sent
 */
Communicator.prototype.send = function(payload,done){
  var self = this
  if('string' === typeof payload) payload = {message: payload}
  if('object' !== typeof payload){
    done('Invalid payload type, must be string or object')
  } else {
    var req = new ObjectManage(payload)
    if(!req.exists('sent')) req.set('sent',new Date().getTime())
    //run middleware
    async.eachSeries(self.middleware.send,
      function(fn,next){fn(req.get(),next)},
      function(err){
        if(err) done(err)
        else {
          var buf = encode(req.get())
          self.socket.send(
            buf,0,buf.length,
            self.options.get('port'),
            self.options.get('address'),
            done
          )
        }
      }
    )
  }
}


/**
 * Export module
 * @type {Communicator}
 */
module.exports = Communicator
