'use strict';
/*jshint bitwise: false*/
var config = require('../config')
  , logger = require('../helpers/logger')
  , communicator = require('../helpers/communicator')
  , myStats = require('./peerStats')
  , peerNext = require('./peerNext')
  , ping = require('./ping')
  , announce = require('./announce')

//connection handles
var conn = {udp: {}, tcp: {}}


/**
 * Export connections
 * @type {object}
 */
exports.conn = conn


/**
 * Start mesh
 * @param {function} done
 */
exports.start = function(done){
  //start stats collection
  logger.info('Starting self stat collection')
  myStats.start(config.get('mesh.interval.stat'))
  //start next peer selection (delay)
  logger.info('Starting next peer selection')
  peerNext.start(config.get('mesh.interval.peerNext'),config.get('mesh.interval.announce') * 2)
  //start connections
  conn = {}
  conn.udp = communicator.UDP({
    port: config.get('mesh.port'),
    address: config.get('mesh.address'),
    multicast: {
      address: config.get('mesh.multicast.address'),
      ttl: config.get('mesh.multicast.tll'),
      interfaceAddress: config.get('mesh.multicast.interfaceAddress')
    }
  })
  conn.udp.on('error',logger.error)
  conn.tcp = communicator.TCP({port: config.get('mesh.port')})
  conn.tcp.on('error',logger.error)
  //start ping
  ping.start(conn)
  //start announce
  announce.start(conn)
  done()
}


/**
 * Stop mesh
 */
exports.stop = function(){
  //announce
  logger.info('Stopping announce')
  announce.stop()
  //ping
  logger.info('Stopping ping')
  ping.stop()
  //stop network connections
  conn.tcp.close()
  conn.udp.close()
  //next peer selection
  logger.info('Stopping next peer selection')
  peerNext.stop()
  //stats
  logger.info('Stopping self stat collection')
  myStats.stop()
}

if(require.main === module){
  exports.start(function(){
    logger.info('Mesh started and announcing')
  })
}
