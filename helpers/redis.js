'use strict';
var redis = require('redis')
  , config = require('../config')

var client = redis.createClient(config.get('redis.port'),config.get('redis.host'),config.get('redis.options'))
client.on('ready',function(){
  if(config.get('redis.auth')){
    client.auth(config.get('redis.auth'))
  }
})


/**
 * Export Module
 * @return {object} client
 */
module.exports = client
