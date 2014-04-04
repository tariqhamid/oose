'use strict';
/*jshint bitwise: false*/
var config = require('../config')
  , logger = require('../helpers/logger')
  , ping = require('./ping')
  , announce = require('./announce')
  , async = require('async')


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
exports.start = function(conn,cb){
  //start booting
  async.series([
    //start ping
    function(done){ ping.start(conn,done) },
    //start announcements
    function(done){ announce.start(conn,done) }
  ],
    function(err,results){
      cb(err,results)
    }
  )
}


/**
 * Stop mesh
 */
exports.stop = function(cb){
  async.series(
    [
      //stop announce
      function(done){
        logger.info('Stopping announce')
        announce.stop(done)
      },
      //stop ping
      function(done){
        logger.info('Stopping ping')
        ping.stop(done)
      }
    ],
    function(err,results){ cb(err,results) }
  )
}

if(require.main === module){
  exports.start(function(){
    logger.info('Mesh started and announcing')
  })
}
