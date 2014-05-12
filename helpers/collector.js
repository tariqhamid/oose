'use strict';
var async = require('async')
  , EventEmitter = require('events').EventEmitter



/**
 * Collector constructor
 * @constructor
 */
var Collector = function(){
  EventEmitter.call(this)
  this.tasks = {collect: [], process: [], save: []}
  this.timeout = null
}
Collector.prototype = Object.create(EventEmitter.prototype)


/**
 * Add collect middleware
 * @param {function} fn
 */
Collector.prototype.collect = function(fn){
  this.tasks.collect.push(fn)
}


/**
 * Add process middleware
 * @param {function} fn
 */
Collector.prototype.process = function(fn){
  this.tasks.process.push(fn)
}


/**
 * Add save middleware
 * @param {function} fn
 */
Collector.prototype.save = function(fn){
  this.tasks.save.push(fn)
}


/**
 * Run the main collector loop
 * @param {Number} interval
 */
Collector.prototype.run = function(interval){
  var self = this
  self.emit('start',interval)
  var run = function(){
    self.emit('loopStart')
    var basket = {}
    var tasks = [function(done){done(null,basket)}].concat(
      self.tasks.collect,
      self.tasks.process,
      self.tasks.save
    )
    async.waterfall(tasks,function(err){
      if(err) self.emit('error',err)
      else {
        self.emit('loopEnd',basket)
        self.timeout = setTimeout(run,interval)
      }
    })
  }
  //kick off loop
  run()
}


/**
 * Start the collector loop
 * @param {number} interval
 * @param {number} delay
 * @param {function} done
 */
Collector.prototype.start = function(interval,delay,done){
  var self = this
  if('function' === typeof delay){
    done = delay
    delay = null
  }
  if('function' !== typeof done) done = function(){}
  setTimeout(function(){
    self.run(interval)
  },delay || 0)
  done()
}


/**
 * Stop the collector loop
 * @param {function} done
 */
Collector.prototype.stop = function(done){
  if('function' !== typeof done) done = function(){}
  if(this.timeout) clearTimeout(this.timeout)
  this.emit('end')
  done()
}


/**
 * Export module
 * @type {Collector}
 */
module.exports = Collector
