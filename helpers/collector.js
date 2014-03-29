'use strict';
var async = require('async')
  , util = require('util')
  , EventEmitter = require('events').EventEmitter



/**
 * Collector constructor
 * @constructor
 */
var Collector = function(){
  var self = this
  EventEmitter.call(this)
  self.middleware = {
    collect: [],
    process: [],
    store: []
  }
  self.basket = {}
  self.timeout = null
}
util.inherits(Collector,EventEmitter)


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
    self.basket = {}
    //collect
    async.eachSeries(
      self.middleware.collect,
      function(fn,next){fn(self.basket,next)},
      function(err){
        if(err) self.emit('error',err)
        //process
        async.eachSeries(
          self.middleware.process,
          function(fn,next){fn(self.basket,next)},
          function(err){
            if(err) self.emit('error',err)
            //store
            async.eachSeries(
              self.middleware.store,
              function(fn,next){fn(self.basket,next)},
              function(err){
                if(err) self.emit('error',err)
                self.timeout = setTimeout(run,interval)
              }
            )
          }
        )
      }
    )
  }
  run()
}


/**
 * Stop the collector loop
 */
Collector.prototype.stop = function(){
  if(this.timeout) clearTimeout(this.timeout)
}


/**
 * Export module
 * @type {Collector}
 */
module.exports = Collector
