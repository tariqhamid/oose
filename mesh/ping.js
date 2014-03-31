'use strict';
var config = require('../config')

var pingHosts = {}
var pingTimeout

var pingSend = function(conn){
  var start = new Date().getTime()
  conn.udp.multicast.send('ping',function(){
    pingTimeout = setTimeout(pingSend,config.get('mesh.pingInterval'))
  })
  //server
  conn.udp.multicast.on('ping',function(req,rinfo){
    conn.udp.send(rinfo.port,rinfo.address,'ping')
  })
  //client
  conn.udp.on('ping',function(res,rinfo){
    pingHosts[rinfo.address] = new Date().getTime() - start
  })
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
exports.start = function(conn){
  pingSend(conn)
}


/**
 * End Pinging
 */
exports.stop = function(){
  if(pingTimeout)
    clearTimeout(pingTimeout)
}
