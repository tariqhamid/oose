'use strict';
var redis = require('redis')
  , config = require('../config')

var client = redis.createClient(config.redis.port,config.redis.host,config.redis.options)
client.on('ready',function(){
  if(config.redis.auth){
    client.auth(config.redis.auth)
  }
})


/**
 * Export Module
 * @return {object} client
 */
module.exports = client
