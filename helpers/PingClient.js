'use strict';
var axon = require('axon')
var debug = require('debug')('oose:helper:PingClient')
var EventEmitter = require('events').EventEmitter



/**
 * Setup a new ping client
 * @param {number} port
 * @param {string} ip
 * @param {number} interval
 * @param {number} max
 * @constructor
 */
var PingClient = function(port,ip,interval,max){
  EventEmitter.call(this)
  this.connected = false
  this.ip = ip
  this.port = port
  this.interval = +interval || 1000
  this.max = +max || (+interval * 10)
  this.maxTimeout = this.max * 2
  this.highWaterMark = (this.max / this.interval) * 2
  this.sock = axon.socket('sub-emitter')
  this.sock.sock.set('retry max timeout',this.maxTimeout)
  this.sock.sock.set('hwm',this.highWaterMark)
  this.info = {
    latency: {
      current: 0,
        history: []
    },
    last: {
      token: '',
        stamp: 0
    }
  }
}
PingClient.prototype = Object.create(EventEmitter.prototype)


/**
 * Handle a new ping request
 * @param {object} req
 * @return {*}
 */
PingClient.prototype.handler = function(req){
  var that = this
  //validate request
  if(!req || !req.token || !req.stamp){
    debug(that.ip,'got invalid ping request ignoring',req)
    return
  }
  //push the newest record
  var latency = req.stamp - that.info.last.stamp - that.interval
  //if the latency is outside of our max window ignore it
  if(latency > that.max){
    debug(that.ip,'ignoring late or first ping',latency)
    that.info.last.token = req.token
    that.info.last.stamp = req.stamp
    return
  }
  //store new latency record
  that.info.latency.current = latency
  that.info.latency.history.push(latency)
  //trim any old records off the front
  if(that.info.latency.history.length > 10)
    that.info.latency.history.splice(0,that.info.latency.history.length - 10)
  //keep info to compare with next events
  that.info.last.token = req.token
  that.info.last.stamp = req.stamp
  that.emit('ping',latency)
}


/**
 * Start a connection
 * @param {function} done
 * @return {*}
 */
PingClient.prototype.connect = function(done){
  var that = this
  if(that.connected) return done('already connected')
  //handle errors
  that.sock.sock.on('error',function(err){
    debug(that.ip,'got error',err)
    that.tearDown(function(error){
      if(error) err = err + ' ' + error
      that.emit('error',err)
    })
  })
  that.sock.sock.on('socket error',function(err){
    debug(that.ip,'got socket error',err)
    that.tearDown(function(error){
      if(error) err = err + ' ' + error
      that.emit('error',err)
    })
  })
  //safety timeout on bad connections
  /*
  var connectionTimeout = setTimeout(function(){
    that.tearDown(function(err){
      if(err) that.emit(err)
      done('failed to connect')
    })
  },that.max)
  */
  debug(that.ip,'connecting on port ' + that.port)
  that.sock.connect(that.port,that.ip,function(){
    if(!that.sock) return
    //clearTimeout(connectionTimeout)
    that.connected = true
    that.sock.on('disconnect',function(){
      debug(that.ip,'got close event, cleaning up records')
      that.stop(function(err){
        if(err) that.emit(err)
      })
    })
    that.sock.on('ping',function(req){
      that.handler(req)
    })
    that.emit('connect')
    done()
  })
}


/**
 * Tear down the client
 * @param {function} done
 */
PingClient.prototype.tearDown = function(done){
  var that = this
  debug(that.ip,'starting teardown')
  //clean the client
  if(that.sock){
    that.sock.listeners = []
    that.sock.close()
  }
  debug(that.ip,'teardown complete')
  done()
}


/**
 * Stop a ping connection
 * @param {function} done
 */
PingClient.prototype.stop = function(done){
  var that = this
  that.tearDown(function(err){
    if(err) return done(err)
    that.emit('stop')
  })
}


/**
 * Export PingClient
 * @type {PingClient}
 */
module.exports = PingClient
