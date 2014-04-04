'use strict';
var config = require('../config')
  , logger = require('../helpers/logger')
  , util = require('util')
var pingHosts = {}
var pingTimeout
var start

var pingListen = function(conn){
  //server
  conn.udp.on('ping',function(req,rinfo){
    conn.udp.send('pong',{},rinfo.port,rinfo.address)
  })
  //client
  conn.udp.on('pong',function(res,rinfo){
    pingHosts[rinfo.address] = new Date().getTime() - start
  })
}

var pingSend = function(conn){
  start = new Date().getTime()
  conn.udp.send('ping')
  if(config.get('mesh.debug') > 1) logger.info('pingHosts:' + util.inspect(pingHosts))
  pingTimeout = setTimeout(function(){pingSend(conn)},config.get('mesh.interval.ping'))
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
 * @param {object} conn
 */
exports.start = function(conn,cb){
  pingListen(conn)
  pingSend(conn)
  if(cb && 'function' === typeof cb){ cb(null,null) }
}


/**
 * End Pinging
 */
exports.stop = function(){
  if(pingTimeout)
    clearTimeout(pingTimeout)
}
