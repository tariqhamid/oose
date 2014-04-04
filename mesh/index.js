'use strict';
/*jshint bitwise: false*/
var config = require('../config')
  , logger = require('../helpers/logger')
  , communicator = require('../helpers/communicator')
  , ping = require('./ping')
  , announce = require('./announce')
  , async = require('async')

//connection handles
var conn = {udp: {}, tcp: {}}


/**
 * Export connections
 * @type {object}
 */
exports.conn = conn


/**
 * Ping system
 * @type {*|exports}
 */
exports.ping = ping


/**
 * Announce system
 * @type {*|exports}
 */
exports.announce = announce


/**
 * Start mesh
 * @param {function} done
 */
exports.start = function(done){
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
  conn.tcp = communicator.TCP({port: config.get('mesh.port')})
  //connection error handling
  conn.udp.on('error',logger.error)
  conn.tcp.on('error',logger.error)
  //start booting
  async.series([
    //start ping
    function(done){ ping.start(conn,done) },
    //start announcements
    function(done){ announce.start(conn,done) }
  ],
    function(err,results){
      done(err,results)
    }
  )
}


/**
 * Stop mesh
 */
exports.stop = function(){
  async.series([
    //stop announce
    function(){
      logger.info('Stopping announce')
      announce.stop()
    },
    //stop ping
    function(){
      logger.info('Stopping ping')
      ping.stop()
    },
    //stop network connections
    function(){
      conn.tcp.close()
      conn.udp.close()
    },
    //stop next peer selection
    function(){
      logger.info('Stopping next peer selection')
      peerNext.stop()
    },
    //stats
    function(){
      logger.info('Stopping self stat collection')
      myStats.stop()
    }
  ])
}

if(require.main === module){
  exports.start(function(){
    logger.info('Mesh started and announcing')
  })
}
