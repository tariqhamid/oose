'use strict';
//mesh peer load tracker
var ObjectManage = require('object-manage')
  , os = require('os')
  , util = require('util')
  , async = require('async')
  , EventEmitter = require('events').EventEmitter



/**
 * Collector constructor, accepts options
 * @constructor
 * @param {object} options
 */
var Collector = function(options){
  var self = this
  //init event emitter
  EventEmitter.call(self)
  //setup options
  self.options = new ObjectManage(self.optionSchema)
  self.options.load(options)
  self.socket = null

  //run middleware
  async.eachSeries(self.middleware.collect,
    function(fn,next){fn(res,next)},function(err){
      if(err) self.emit('error',err)
      else self.emit('receive',res)
    }
  )
}
util.inherits(Collector,EventEmitter)


/**
 * Configuration Defaults
 * @type {{proto: string, mcast: {address: null, ttl: number}, address: string, port: number}}
 */
Collector.prototype.optionSchema = {
  mainInterval: 1000
}


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

module.exports = Collector
