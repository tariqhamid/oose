'use strict';
var async = require('async')
var EventEmitter = require('events').EventEmitter
var cp = require('child_process')



/**
 * Sherder Command helper
 * @param {object} job
 * @param {string} command
 * @constructor
 */
var Command = function(job,command){
  EventEmitter.call(this)
  this.job = job
  this.command = command
}
Command.prototype = Object.create(EventEmitter.prototype)


/**
 * Compile arguments from shredder API
 * @param {Parameter} parameter manager
 * @param {array} args
 * @param {function} done
 */
Command.prototype.compile = function(parameter,args,done){
  var that = this
  var parsed = []
  async.each(
    args,
    function(v,next){
      if(v.key) parsed.push(v.key)
      if(!v.value) return next()
      v.value = parameter.render(v.value)
      that.job.resource.render(v.value,function(err,result){
        if(err) return next(err)
        parsed.push(result)
        next()
      })
    },
    function(err){
      if(err) return done(err)
      done(null,parsed)
    }
  )
}


/**
 * Execute command
 * @param {Parameter} parameter
 * @param {Array} args
 */
Command.prototype.execute = function(parameter,args){
  var that = this
  async.series(
    [
      //parse the args into a command replacing template vars and resources
      function(next){
        that.compile(parameter,args,function(err,result){
          if(err) return next(err)
          that.emit('compile',that.command,result)
          args = result
          next()
        })
      },
      //execute the command
      function(next){
        that.job.logger.info('Executing command: ' + that.command + ' ' + args.join(' '))
        var q = cp.spawn(that.command,args)
        q.stdout.setEncoding('utf-8')
        q.stdout.on('data',function(data){
          that.emit('stdout',data)
        })
        q.stderr.setEncoding('utf-8')
        q.stderr.on('data',function(data){
          that.emit('stderr',data)
        })
        q.on('error',function(err){
          next(err)
        })
        q.on('close',function(){
          next()
        })
      }
    ],
    function(err){
      if(err) return that.emit('error',err)
      that.emit('end')
    }
  )
}


/**
 * Export class
 * @type {Command}
 */
module.exports = Command
