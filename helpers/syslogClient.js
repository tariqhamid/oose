'use strict';
var dgram = require('dgram')
var glossy = require('glossy')
var os = require('os')

var SyslogClient = function(options){
  var that = this
  if(!options) options = {}
  if(!options.producer) options.producer = {}
  options.port = options.port || 514
  options.producer.facility =
    options.producer.facility || options.facility || 'local0'
  options.producer.pid =
    options.producer.pid || options.pid || process.pid.toString()
  options.producer.host =
    options.producer.host || os.hostname().toLowerCase()
  that._sock = dgram.createSocket(options.family || 'udp4')
  if(options.sourcePort || options.host)
    that._sock.bind(options.sourcePort,options.host)
  that.options = options
  var glossyProducer = new glossy.Produce(options.producer)
  that.produce = glossyProducer.produce.bind(glossyProducer)
}

SyslogClient.prototype.send = function(data,done){
  var that = this
  var msg = new Buffer(that.produce(data))
  that._sock.send(msg,0,msg.length,that.options.port,'localhost',done)
}

module.exports = SyslogClient
