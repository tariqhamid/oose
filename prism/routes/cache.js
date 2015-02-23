'use strict';
var redis = require('../../helpers/redis')


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
    exists: function(){
      return redis.removeKeysPattern(redis.schema.contentExists('*'))
    },
    purchase: function(){
      return redis.removeKeysPattern(redis.schema.purchase('*'))
    },
    session: function(){
      return redis.removeKeysPattern(redis.schema.userSession('*'))
    },
    stats: function(){
      return redis.removeKeysPattern(redis.schema.statKeys())
    },
    masterUp: function(){
      return redis.removeKeysPattern(redis.schema.masterUp())
    },
    prismList: function(){
      return redis.removeKeysPattern(redis.schema.prismList())
    },
    storeList: function(){
      return redis.removeKeysPattern(redis.schema.storeList())
    },
    prismHits: function(){
      return redis.removeKeysPattern(redis.schema.prismHits('*','*'))
    },
    storeHits: function(){
      return redis.removeKeysPattern(redis.schema.storeHits('*','*'))
    },
    storeEntry: function(){
      return redis.removeKeysPattern(redis.schema.storeEntry('*'))
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
    exists: function(){
      return redis.getKeysPattern(redis.schema.contentExists('*'))
    },
    purchase: function(){
      return redis.getKeysPattern(redis.schema.purchase('*'))
    },
    session: function(){
      return redis.getKeysPattern(redis.schema.userSession('*'))
    },
    stats: function(){
      return redis.getKeysPattern(redis.schema.statKeys())
    },
    masterUp: function(){
      return redis.getKeysPattern(redis.schema.masterUp())
    },
    prismList: function(){
      return redis.getKeysPattern(redis.schema.prismList())
    },
    storeList: function(){
      return redis.getKeysPattern(redis.schema.storeList())
    },
    prismHits: function(){
      return redis.getKeysPattern(redis.schema.prismHits('*','*'))
    },
    storeHits: function(){
      return redis.getKeysPattern(redis.schema.storeHits('*','*'))
    },
    storeEntry: function(){
      return redis.getKeysPattern(redis.schema.storeEntry('*'))
    }
  }
  commands[command]()
    .then(function(result){
      res.send(JSON.stringify(result,null,'  '))
    })
}
