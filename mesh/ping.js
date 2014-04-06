'use strict';
var mesh = require('../mesh')
  , config = require('../config')
  , logger = require('../helpers/logger')
  , util = require('util')
var pingHosts = {}
var pingTimeout
var start

var pingListen = function(){
  //server
  mesh.udp.on('ping',function(req,rinfo){
    mesh.udp.send('pong',{},rinfo.port,rinfo.address)
  })
  //client
  mesh.udp.on('pong',function(res,rinfo){
    pingHosts[rinfo.address] = new Date().getTime() - start
  })
}

var pingSend = function(){
  start = new Date().getTime()
  mesh.udp.send('ping')
  if(config.get('mesh.debug') > 1) logger.info('pingHosts:' + util.inspect(pingHosts))
  pingTimeout = setTimeout(function(){pingSend(mesh)},config.get('mesh.interval.ping'))
}


/**
 * Determine max ping
 * @return {number}
 */
exports.max = function(){
  var max = 0
  for(var i in pingHosts){
    if(pingHosts.hasOwnProperty(i) && pingHosts[i] > max){
      max = pingHosts[i]
    }
  }
  return max
}


/**
 * Start pinging
 * @param {function} done
 */
exports.start = function(done){
  pingListen(mesh)
  pingSend(mesh)
  if(done && 'function' === typeof done){ done() }
}


/**
 * End Pinging
 * @param {function} done Callback
 */
exports.stop = function(done){
  if(pingTimeout)
    clearTimeout(pingTimeout)
  if(done && 'function' === typeof done){ done() }
}
