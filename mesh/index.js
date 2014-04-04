'use strict';
var communicator = require('../helpers/communicator')
  , logger = require('../helpers/logger')
  , config = require('../config')
  , async = require('async')

//connection handles
var conn = {}


/**
 * Start connections
 * @param {function} done
 */
conn.start = function(done){
  //start udp
  conn.udp = communicator.UDP({
    port: config.get('mesh.port'),
    address: config.get('mesh.address'),
    multicast: {
      address: config.get('mesh.multicast.address'),
      ttl: config.get('mesh.multicast.ttl'),
      interfaceAddress: config.get('mesh.multicast.interfaceAddress')
    }
  })
  //start tcp
  conn.tcp = communicator.TCP({port: config.get('mesh.port')})
  //connection error handling
  conn.udp.on('error',logger.error)
  conn.tcp.on('error',logger.error)
  done()
}


/**
 * Stop mesh
 * @param {function} done
 */
conn.stop = function(done){
  async.series([function(next){conn.udp.close(next)},function(next){conn.tcp.close(next)}],done)
}


/**
 * Export connection handle
 */
module.exports = conn
