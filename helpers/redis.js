'use strict';
var async = require('async')
var debug = require('debug')('redis:helper')
var genericPool = require('generic-pool');
var redis = require('redis')

var config = require('../config')

var primaryHandle = false

var nullCb = function(){}
var pool = genericPool.Pool({
  name: 'redisPool0',
  max: 10,
  create: function(done){
    /*jshint bitwise: false*/
    var cfg = config.redis
    var cb = (done && ('function' === typeof done)) ? done : nullCb
    var client = redis.createClient(cfg.port,cfg.host,cfg.options)
    //bind at least one error handler so it won't throw/fatal
    client.on('error',function(err){ debug('ERROR:',err) })
    //handle auth
    if(cfg.auth) client.auth(cfg.auth)
    //handle db option and selecting
    var db = (cfg.db >> 0)
    if(cfg.db && 'number' !== typeof cfg.db)
      debug('WARNING: db option should be number 0-9, using ' + db)
    if(0 < db && 10 > db){
      client.select(db)
      //reselect whenever we get reconnected as well
      client.on('ready',function(){
        client.send_anyways = true //jshint ignore:line
        client.select(db)
        client.send_anyways = false //jshint ignore:line
      })
    }
    //only call the callback if we have to
    if(nullCb !== cb) cb(null,client)
  },
  destroy: function(redisClient){ redisClient.quit() }
})

if(!primaryHandle){
  //none existing, get one from the pool
  async.series([
    function(next){
      pool.acquire(function(err,client){
        if(err) return next(err)
        primaryHandle = client
        next()
      })
    }
  ],function(err){
    if(err) debug('grabbing primaryHandle failed: ',err)
  })
}


/**
 * Export Module
 * @return {object} client
 */
module.exports = primaryHandle
