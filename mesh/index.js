'use strict';
/*jshint bitwise: false*/
var config = require('../config')
  , logger = require('../helpers/logger')
  , communicator = require('../helpers/communicator')
  , myStats = require('./peerStats')
  , nextPeer = require('./nextPeer')
  , ping = require('./ping')
  , announce = require('./announce')

//connection handles
var conn


/**
 * Export unicast connections
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
  myStats.start(config.get('mesh.statInterval'))
  //start next peer selection (delay)
  logger.info('Starting next peer selection')
  nextPeer.start(config.get('mesh.nextPeerInterval'),config.get('mesh.announceInterval') * 2)
  //start unicast
  conn = {
    udp: new communicator.UDP(config.get('mesh.port')),
    tcp: new communicator.TCP(config.get('mesh.port'))
  }
  //setup multicast
  conn.udp.addMulticast(config.get('mesh.address'),config.get('mesh.ttl'))
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
  //next peer selection
  logger.info('Stopping next peer selection')
  nextPeer.stop()
  //stats
  logger.info('Stopping self stat collection')
  myStats.stop()
}

if(require.main === module){
  exports.start(function(){
    logger.info('Mesh started and announcing')
  })
}
