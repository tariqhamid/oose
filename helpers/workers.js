'use strict';
var debug = require('debug')('animegg:helper:workers')
var EventEmitter = require('events').EventEmitter
var Q = require('q')

var workers = []


/**
 * Emergency shutdown handler
 */
process.on('exit',function(){
  workers.forEach(function(worker){
    worker.kill()
  })
})



/**
 * Setup a new worker control instance
 * @param {number} count
 * @param {string} file
 * @param {array} args
 * @param {boolean} silent
 * @constructor
 */
var Workers = function(count,file,args,silent){
  EventEmitter.call(this)
  this.count = count || 1
  this.running = false
  this.stopping = false
  this.file = file || 'worker.js'
  this.cluster = require('cluster')
  this.cluster.setupMaster({
    exec: this.file,
    args: args || [],
    silent: silent || false
  })
  workers.push(this)
}
Workers.prototype = Object.create(EventEmitter.prototype)


/**
 * Fork a new worker with internal options
 */
Workers.prototype.fork = function(){
  this.cluster.fork()
}


/**
 * Start workers
 * @param {function} done
 */
Workers.prototype.start = function(done){
  var that = this
  var online = 0
  //setup the promise to return
  var deferred = Q.defer()
  deferred.promise.then(
    function(){
      debug('Workers started')
      that.cluster.removeAllListeners('online')
      that.running = true
      that.emit('online')
      done()
    },
    function(err){
      done(err)
    }
  )
  debug('Starting ' + that.count + ' workers')
  //spawn workers
  for(var i=1; i <= that.count; i++) that.fork()
  //wait for workers to come online
  that.cluster.on('online',function(worker){
    debug('Worker ' + worker.id + ' online')
    online++
    if(online >= that.count && !that.running){
      deferred.resolve()
    }
  })
  that.cluster.on('exit',that.respawn.bind(that))
}


/**
 * Restart failed workers
 * @param {cluster.worker} worker
 * @param {number} code
 * @param {string} signal
 */
Workers.prototype.respawn = function(worker,code,signal){
  var that = this
  debug('Worker ' + worker.id + ' exited',code,signal)
  that.emit('exit',worker,code,signal)
  if(0 !== code && !that.stopping){
    debug('Worker ' + worker.id + ' died (' + (signal || code) + ') restarting')
    that.cluster.once('online',function(worker){
      debug('Worker ' + worker.id + ' is now online')
      that.emit('respawn',worker,code,signal)
    })
    //start the new worker
    that.fork()
  }
}


/**
 * Stop workers
 * @param{function} done
 * @return {*}
 */
Workers.prototype.stop = function(done){
  var that = this
  if(!that.running) return done()
  var interval
  var online = that.count
  that.stopping = true
  that.emit('stopping')
  debug('Stopping all workers')
  that.cluster.removeAllListeners('exit')
  that.cluster.removeAllListeners('online')
  //setup the promise to return
  var deferred = Q.defer()
  deferred.promise.then(
    function(){
      if(interval) clearInterval(interval)
      that.emit('offline')
      that.stopping = false
      that.running = false
      done()
    },
    function(err){
      done(err)
    }
  )
  //tell all the workers to stop
  for(var id in that.cluster.workers){
    if(!that.cluster.workers.hasOwnProperty(id)) continue
    that.cluster.workers[id].send('stop')
  }
  //wait for the workers to all die
  var wait = function(){
    if(!that.cluster.workers) deferred.resolve()
    online = Object.keys(that.cluster.workers).length
    if(online > 0)
      debug('Waiting on ' + online + ' workers to exit')
    if(0 === online){
      debug('Workers have stopped')
      deferred.resolve()
    }
  }
  interval = setInterval(wait,1000)
}


/**
 * Kill workers if they arent already dead
 */
Workers.prototype.kill = function(){
  var that = this
  var worker
  for(var i in that.cluster.workers){
    if(!that.cluster.workers.hasOwnProperty(i)) continue
    worker = that.cluster.workers[i]
    debug(that.file,'sending worker pid ' + worker.process.pid + ' kill')
    worker.process.kill()
  }
}


/**
 * Export workers class
 * @type {Workers}
 */
module.exports = Workers
