'use strict';
var ObjectManage = require('object-manage')

var redis = require('../../helpers/redis')

var config = require('../../config')


/**
 * Homepage
 * @param {object} req
 * @param {object} res
 */
exports.index = function(req,res){
  redis.incr(redis.schema.counter('prism','index'))
  res.json({message: 'Welcome to OOSE version ' + config.version})
}


/**
 * Ping pong for health checks
 * @param {object} req
 * @param {object} res
 */
exports.ping = function(req,res){
  redis.incr(redis.schema.counter('prism','ping'))
  res.json({pong: 'pong'})
}


/**
 * Print stats
 * @param {object} req
 * @param {object} res
 */
exports.stats = function(req,res){
  redis.incr(redis.schema.counter('prism','stat'))
  var stat = new ObjectManage()
  redis.keysAsync(redis.schema.statKeys())
    .then(function(results){
      return results
    })
    .each(function(key){
      return redis.getAsync(key)
        .then(function(result){
          stat.$set(
            key.replace(/:/g,'.').replace('oose.counter.',''),
            result
          )
        })
    })
    .then(function(){
      res.send(JSON.stringify(stat.$strip(),null,'  '))
    })
}


/**
 * Cache routes
 * @type {object}
 */
exports.cache = require('./cache')


/**
 * Content routes
 * @type {object}
 */
exports.content = require('./content')


/**
 * Purchase routes
 * @type {object}
 */
exports.purchase = require('./purchase')


/**
 * User routes
 * @type {object}
 */
exports.user = require('./user')
