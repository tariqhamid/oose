'use strict';
var async = require('async')
  , EventEmitter = require('events').EventEmitter
  , util = require('util')

/**
 * Collector constructor
 * @constructor
 */
var Collector = function(){
  EventEmitter.call(this)
}
util.inherits(Collector,EventEmitter)

/**
 * Basket to store the internal collector info
 * @type {{}}
 */
Collector.prototype.basket = {}

/**
 * Timeout used by the loop timer
 * @type {null}
 */
Collector.prototype.timeout = null

/**
 * Middleware stack
 * @type {{send: Array, receive: Array}}
 */
Collector.prototype.middleware = {
  collect: [],
  process: [],
  store: []
}

/**
 * Add middleware
 * @param {string} position  Position of the middleware either send or receive
 * @param {function} fn
 */
Collector.prototype.use = function(position,fn){
  var self = this
  if('function' === typeof position){
    fn = position
    position = 'collect'
  }
  if('process' !== position || 'store' !== position) position = 'collect'
  self.middleware[position].push(fn)
}

/**
 * Start the collector loop
 * @param {number} interval
 */
Collector.prototype.start = function(interval){
  var self = this
  var run = function(){
    //run middleware
    async.eachSeries(self.middleware.collect,function(fn,next){fn(self.basket,next)},function(err){
        if(err) self.emit('error',err)
      }
    )
    async.eachSeries(self.middleware.process,
      function(fn,next){fn(self.basket,next)},function(err){
        if(err) self.emit('error',err)
      }
    )
    async.eachSeries(self.middleware.store,
      function(fn,next){fn(self.basket,next)},function(err){
        if(err) self.emit('error',err)
      }
    )
    setTimeout(run,interval)
  }
  run()
}

/**
 * Stop the collector loop
 */
Collector.prototype.stop = function(){
  if(this.timeout) clearTimeout(this.timeout)
}

module.exports = Collector
