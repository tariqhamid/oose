'use strict';
var callsite = require('callsite')
var childProcess = require('child_process')
var debug = require('debug')('oose:child')
var EventEmitter = require('events').EventEmitter
var ObjectManage = require('object-manage')
var path = require('path')



/**
 * Fork a child process and call done when it exits
 * @param {string} module
 * @param {object} options
 * @constructor
 */
var Child = function(module,options){
  var that = this
  //resolve the dir of the caller
  var stack = callsite()
  var dir = path.dirname(stack[2].getFileName())
  //setup events
  EventEmitter.call(that)
  //load options
  that.options = new ObjectManage(that.defaultOptions)
  that.options.$load(options || {})
  //module to be ran
  that.module = path.resolve([dir,module].join('/'))
  //handle for child
  that.cp = null
  //pid
  that.pid = 0
  //exitCode
  that.exitCode = 0
  //startup error
  that.startupError = null
  //track if we are stopping
  that.stopping = false
  //tracl if we are running
  that.running = false
  //move to the ready status
  that.status('ready')
}
Child.prototype = Object.create(EventEmitter.prototype)


/**
 * Default options
 * @type {object}
 */
Child.prototype.defaultOptions = {
  respawn: true
}


/**
 * Emit an event whenever status is set
 * @param {string} status
 * @return {string}
 */
Child.prototype.status = function(status){
  if(!status) return this._status || 'dead'
  this._status = status
  this.debug('status changed to',status)
  this.emit('status',status)
}


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
  that.status('starting')
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
    if(that.options.respawn && !that.stopping){
      that.debug('respawn enabled, restarting process')
      that.status('respawn')
      that.start(function(err){
        if(err){
          that.debug('failed to respawn process',err)
          that.emit('error',err)
          return
        }
        that.debug('process respawned successfully')
        that.emit('respawn',that.pid)
      })
    }
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
      that.running = true
      that.status('ok')
      done()
    } else {
      var err = msg.message || 'an unknown error has occurred'
      //kill the child if it didnt exit already
      that.cp.kill()
      that.debug('child started with error',err)
      that.startupError = err
      that.status('error')
      done(err)
    }
  })
}


/**
 * Tell a process to shutdown gracefully
 * @param {number} timeout
 * @param {function} done
 * @return {*}
 */
Child.prototype.stop = function(timeout,done){
  if('function' === typeof timeout){
    done = timeout
    timeout = 0
  }
  var that = this
  //make sure the child is running first
  debug('stop called',that.status())
  if(!that.running){
    that.status('ready')
    return done()
  }
  //mark that we are stopping to prevent respawns
  that.status('stopping')
  that.stopping = true
  //tell the child to stop gracefully
  that.cp.send('stop')
  //only wait a specific amount of time if specified
  if(timeout > 0){
    setTimeout(function(){
      that.cp.kill()
    },timeout)
  }
  that.cp.once('close',function(){
    that.status('ready')
    that.running = false
    done(that.exitCode ? that.exitCode : null)
  })
}


/**
 * Kill the child
 * @return {bool}
 */
Child.prototype.kill = function(){
  if(this.cp){
    this.cp.kill()
    return true
  }
  return false
}


/**
 * Send process a message
 * @param {*} msg
 * @param {net.Socket} socket
 * @return {Bool}
 */
Child.prototype.send = function(msg,socket){
  if(this.cp){
    this.cp.send(msg,socket)
    return true
  }
  return false
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
  if(!options.respawn) options.respawn = false
  var cp = new Child(module,options)
  cp.on('close',function(){
    if(cp.startupError) return done(cp.startupError)
    done()
  })
  cp.start(function(){})
}


/**
 * Wrap similar to require but return a child process instance
 * @param {string} module
 * @param {object} options
 * @return {Child}
 */
Child.parent = function(module,options){
  return new Child(module,options)
}


/**
 * Helper to setup a child to interact with the parent
 * @param {string} title process title
 * @param {function} start
 * @param {function} stop
 */
Child.child = function(title,start,stop){
  process.title = title
  process.on('message',function(msg){
    if('stop' === msg){
      stop(function(err){
        if(err){
          process.send({status: 'error', message: err})
          process.exit(1)
          return
        }
        process.exit()
      })
    }
  })
  start(function(err){
    if(err){
      process.send({status: 'error',message: err})
      process.exit(1)
      return
    }
    process.send({status: 'ok'})
  })
}


/**
 * Child once wrapper
 * @param {string} title process title
 * @param {function} exec
 */
Child.childOnce = function(title,exec){
  process.title = title
  exec(function(err){
    if(err){
      process.send({status: 'error', message: err})
      process.exit(1)
      return
    }
    process.send({status: 'ok'})
    process.exit()
  })
}


/**
 * Export the helper
 * @type {child}
 */
module.exports = Child
