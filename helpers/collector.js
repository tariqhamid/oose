'use strict';
var async = require('async')
var EventEmitter = require('events').EventEmitter
var ObjectManage = require('object-manage')



/**
 * Collector constructor
 * @constructor
 */
var Collector = function(){
  var that = this
  EventEmitter.call(that)
  that.tasks = {
    collect: [],
    process: [],
    save: []
  }
  that.interval = null
}
Collector.prototype = Object.create(EventEmitter.prototype)


/**
 * Add collect middleware
 * @param {function} fn
 */
Collector.prototype.collect = function(fn){
  var that = this
  that.tasks.collect.push(fn)
}


/**
 * Add process middleware
 * @param {function} fn
 */
Collector.prototype.process = function(fn){
  var that = this
  that.tasks.process.push(fn)
}


/**
 * Add save middleware
 * @param {function} fn
 */
Collector.prototype.save = function(fn){
  var that = this
  that.tasks.save.push(fn)
}


/**
 * Run the main collector loop
 * @param {function} done
 */
Collector.prototype.run = function(done){
  var that = this
  that.emit('loopStart')
  var basket = new ObjectManage()
  var tasks = [function(done){done(null,basket)}].concat(
    that.tasks.collect,
    that.tasks.process,
    that.tasks.save
  )
  tasks.forEach(function(func,i,o){
    o[i] = function(basket,next){
      func(basket,function(err,basket){
        if(!(basket instanceof ObjectManage)){
          return next('Failed to pass basket to next()')
        }
        next(err,basket)
      })
    }
  })
  async.waterfall(tasks,function(err){
    done(err,basket)
  })
}


/**
 * Start the collector loop
 * @param {number} interval
 * @param {number} delay
 * @param {function} done
 */
Collector.prototype.start = function(interval,delay,done){
  var that = this
  if('function' === typeof delay){
    done = delay
    delay = null
  }
  if('function' !== typeof done) done = function(){}
  setTimeout(function(){
    that.emit('start')
    that.interval = setInterval(function(){
      that.run(function(err,basket){
        if(err)
          return that.emit('error',err)
        that.emit('loopEnd',basket)
      })
    },interval)
  },delay)
  done()
}


/**
 * Stop the collector loop
 * @param {function} done
 */
Collector.prototype.stop = function(done){
  var that = this
  if('function' !== typeof done) done = function(){}
  if(that.interval) clearInterval(that.interval)
  that.emit('end')
  done()
}


/**
 * Export module
 * @type {Collector}
 */
module.exports = Collector
