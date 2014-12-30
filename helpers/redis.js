'use strict';
var P = require('bluebird')
var redis = require('redis')

var RedisSchema = require('../helpers/RedisSchema')

var config = require('../config')

//make some promises
P.promisifyAll(redis)

/*jshint bitwise: false*/
var cfg = config.redis
var client = redis.createClient(cfg.port,cfg.host,cfg.options)
//handle auth
if(cfg.auth) client.auth(cfg.auth)
//select db
client.select(cfg.db || 0)


/**
 * Remove keys by a pattern
 * @param {string} pattern
 * @return {P}
 * @this {redis}
 */
client.removeKeysPattern = function(pattern){
  var that = this
  var removed = 0
  return that.keysAsync(pattern)
    .then(function(keys){
      var promises = []
      for(var i = 0; i < keys.length; i++){
        promises.push(
          that.delAsync(keys[i])
        )
      }
      return P.all(promises)
    })
    .then(function(results){
      for(var i = 0; i < results.length; i++)
        removed += results[i]
      return removed
    })
}


/**
 * Add schema to helper
 * @type {RedisSchema}
 */
client.schema = new RedisSchema(config.redis.prefix)


/**
 * Export client
 * @return {object} client
 */
module.exports = client
