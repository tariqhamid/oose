'use strict';
var mesh = require('../mesh')
  , config = require('../config')
  , logger = require('../helpers/logger').create('mesh:ping')
  , util = require('util')
  , shortId = require('shortid')

var pingHosts = {}
var pingTimeout
var thisToken

var pingListen = function(){
  //server
  mesh.udp.on('ping',function(req,rinfo){
    req.rinfo = rinfo
    mesh.udp.send('pong',req,rinfo.port,rinfo.address)
  })
  //client
  mesh.udp.on('pong',function(res,rinfo){
    if(res.token === thisToken){
      pingHosts[rinfo.address] = new Date().getTime() - res.starttime
    } else {
      logger.warn('[MESH PING] Out of order ping response detected and ignored')
    }
  })
}

var pingSend = function(){
  thisToken = shortId.generate()
  mesh.udp.send('ping',{
    token:thisToken,
    starttime:new Date().getTime()
  })
  logger.debug('hosts:' + util.inspect(pingHosts))
  pingTimeout = setTimeout(function(){pingSend(mesh)},config.get('mesh.ping.interval'))
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
