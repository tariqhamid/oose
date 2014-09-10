'use strict';
var dgram = require('dgram')
var syslogParser = require('glossy').Parse

var SyslogServer = function(options){
  var that = this
  if(!options) options = {}
  options.host = options.host || '0.0.0.0'
  options.port = +options.port || 514
  that.parse = syslogParser.parse.bind(syslogParser)
  that._sock = dgram.createSocket(options.family || 'udp4')
  that._sock.bind(options.port,options.host)
  that.options = options
}

SyslogServer.prototype.start = function(receiver,done){
  var that = this
  that._sock.once('listening',function(){
    if('function' === typeof done) done()
  })
  that._sock.on('message',function(msg,rinfo){
    msg = that.parse(msg)
    msg.originalRinfo = rinfo
    //some implementations add a colon to the end of host
    var lastPos = msg.host.length-1;
    if(':' === msg.host.charAt(lastPos)){
      msg.host = msg.host.substring(0,lastPos)
    }
    //some implementations add a null to the end of message
    var lastPos = msg.message.length-1;
    if(0x00 === msg.message.charCodeAt(lastPos)){
      msg.message = msg.message.substring(0,lastPos)
    }
    receiver(msg)
  })
}

module.exports = SyslogServer
