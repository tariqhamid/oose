'use strict';
var redis = require('../../helpers/redis')()


/**
 * Flush cache
 * @param {object} req
 * @param {object} res
 */
exports.flush = function(req,res){
  var command = req.body.command
  var commands = {
    all: function(){
      return redis.removeKeysPattern(redis.schema.flushKeys())
    },
    stats: function(){
      return redis.removeKeysPattern(redis.schema.statKeys())
    },
    prismHits: function(){
      return redis.removeKeysPattern(redis.schema.prismHits('*','*'))
    },
    storeHits: function(){
      return redis.removeKeysPattern(redis.schema.storeHits('*','*'))
    }
  }
  commands[command]()
    .then(function(count){
      res.json({success: 'ok', count: count})
    })
}


/**
 * Detail cache
 * @param {object} req
 * @param {object} res
 */
exports.detail = function(req,res){
  var command = req.body.command
  var commands = {
    all: function(){
      return redis.getKeysPattern(redis.schema.flushKeys())
    },
    stats: function(){
      return redis.getKeysPattern(redis.schema.statKeys())
    },
    prismHits: function(){
      return redis.getKeysPattern(redis.schema.prismHits('*','*'))
    },
    storeHits: function(){
      return redis.getKeysPattern(redis.schema.storeHits('*','*'))
    }
  }
  commands[command]()
    .then(function(result){
      res.send(JSON.stringify(result,null,'  '))
    })
}
