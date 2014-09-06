'use strict';
var childProcess = require('child_process')
var debug = require('debug')('oose:child')
var EventEmitter = require('events').EventEmitter
var ObjectManage = require('object-manage')



/**
 * Fork a child process and call done when it exits
 * @param {string} module
 * @param {object} options
 * @constructor
 */
var Child = function(module,options){
  var that = this
  //setup events
  EventEmitter.call(that)
  //load options
  that.options = new ObjectManage(that.defaultOptions)
  that.options.$load(options || {})
  //module to be ran
  that.module = module
  //handle for child
  that.cp = null
  //pid
  that.pid = 0
  //exitCode
  that.exitCode = 0
  //startup error
  that.startupError = null
}
Child.prototype = Object.create(EventEmitter.prototype)


/**
 * Default options
 * @type {object}
 */
Child.prototype.defaultOptions = {}


/**
 * Debug messaging
 */
Child.prototype.debug = function(){
  var that = this
  var args = [that.pid || that.module]
  for(var i in arguments){
    if(!arguments.hasOwnProperty(i)) continue
    args.push(arguments[i])
  }
  debug.apply(null,args)
}


/**
 * Start the child process, when it responds, call done
 * @param {function} done
 */
Child.prototype.start = function(done){
  var that = this
  that.debug('Starting child process')
  //spawn the new process, capture the pid
  that.cp = childProcess.fork(that.module)
  that.pid = that.cp.pid
  that.debug(
    'Spawned process with pid of ' + that.cp.pid + ' to execute ' + that.module)
  //store the exitCode if we get it, and pass the event upwards
  that.cp.on('exit',function(code){
    that.debug('Child exited with code',code)
    that.exitCode = code
    that.emit('exit',code)
  })
  //on close pass the event upwards
  that.cp.on('close',function(){
    that.debug('process has closed')
    that.emit('close')
  })
  //the first message should be the status of starting
  that.cp.once('message',function(msg){
    that.debug('got init message',msg)
    //setup the message handler for future messages (the first is special)
    //additional messages (including the first should be passed upwards)
    that.cp.on('message',function(msg){
      that.emit('message',msg)
      //check if the message is an error (if so emit an error event too)
      if(msg && msg.status && msg.message && 'error' === msg.status){
        that.emit('error',msg.message)
      }
    })
    //handle the initial message
    if('ok' === msg.status){
      that.debug('child started without error')
      done()
    } else {
      var err = msg.message || 'an unknown error has occurred'
      that.debug('child started with error',err)
      that.startupError = err
      done(err)
    }
  })
}


/**
 * Tell a process to shutdown gracefully
 * @param {number} timeout
 * @param {function} done
 */
Child.prototype.stop = function(timeout,done){
  if('function' === typeof timeout){
    done = timeout
    timeout = 0
  }
  var that = this
  that.cp.send('stop')
  if(timeout > 0){
    setTimeout(function(){
      that.cp.kill()
    },timeout)
  }
  that.cp.once('close',function(){
    done(that.options.exitCode)
  })
}


/**
 * Send process a message
 * @param {*} msg
 * @param {net.Socket} socket
 */
Child.prototype.send = function(msg,socket){
  this.cp.send(msg,socket)
}


/**
 * Shortcut to start a child and return when it closes
 * @param {string} module
 * @param {object} options
 * @param {function} done
 */
Child.fork = function(module,options,done){
  if('function' === typeof options){
    done = options
    options = {}
  }
  var cp = new Child(module,options)
  cp.on('close',function(){
    if(cp.startupError) return done(cp.startupError)
    done()
  })
  cp.start(function(){})
}


/**
 * Export the helper
 * @type {child}
 */
module.exports = Child
