'use strict';
var debug = require('debug')('oose:mesh:ping')
var util = require('util')

var logger = require('../helpers/logger').create('mesh:ping')
var shortId = require('../helpers/shortid')

var config = require('../config')
var mesh = require('../mesh')

var pingHosts = {}
var pingInterval
var thisToken


/**
 * Ping server
 * @param {object} req
 * @param {object} rinfo
 */
var pingServer = function(req,rinfo){
  req.rinfo = rinfo
  mesh.udp.send('pong',req,rinfo.port,rinfo.address)
}


/**
 * Ping client
 * @param {object} res
 * @param {object} rinfo
 */
var pingClient = function(res,rinfo){
  if(res.token === thisToken){
    pingHosts[rinfo.address] = new Date().getTime() - res.starttime
  } else {
    debug('[MESH PING] Out of order ping response detected and ignored')
  }
}


/**
 * Setup listeners for ping requests
 * @param {Mesh} mesh
 */
var pingListen = function(mesh){
  mesh.udp.on('ping',pingServer) //server
  mesh.udp.on('pong',pingClient) //client
}


/**
 * Remove listeners for ping requests
 * @param {Mesh} mesh
 */
var pingStop = function(mesh){
  mesh.udp.removeListener('ping',pingServer)
  mesh.udp.removeListener('pong',pingClient)
}


/**
 * Send a ping request to multicast
 * @param {Mesh} mesh
 */
var pingSend = function(mesh){
  thisToken = shortId.generate()
  mesh.udp.send('ping',{
    token:thisToken,
    starttime:new Date().getTime()
  })
  debug('hosts:' + util.inspect(pingHosts))
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
  done = done || function(){}
  pingListen(mesh)
  pingInterval = setInterval(
    function(){pingSend(mesh)},
    config.mesh.ping.interval
  )
  done()
}


/**
 * End Pinging
 * @param {function} done Callback
 */
exports.stop = function(done){
  done = done || function(){}
  if(pingInterval) clearInterval(pingInterval)
  pingStop(mesh)
  done()
}
