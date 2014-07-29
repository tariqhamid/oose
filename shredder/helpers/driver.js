'use strict';
var async = require('async')
var cp = require('child_process')


/**
 * Compile arguments from shredder API
 * @param {Resource} resource manager
 * @param {Parameter} parameter manager
 * @param {array} args
 * @param {function} done
 */
exports.commandCompileArgs = function(resource,parameter,args,done){
  var parsed = []
  async.each(
    args,
    function(v,next){
      parsed.push(v.key)
      if(!v.value){
        return next()
      }
      v.value = parameter.render(v.value)
      resource.render(v.value,function(err,result){
        if(err) return next(err)
        v.value = result
        parsed.push(v.value)
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
 * Execute a command using the shredder api format
 * @param {string} cmd
 * @param {Logger} logger
 * @param {Resource} resource manager
 * @param {Parameter} parameter manager
 * @param {object} options
 * @param {function} done
 */
exports.executeCommand = function(cmd,logger,resource,parameter,options,done){
  var args = []
  async.series(
    [
      //parse the args into a command replacing template vars and resources
      function(next){
        exports.commandCompileArgs(resource,parameter,options.args,function(err,result){
          if(err) return next(err)
          args = result
          next()
        })
      },
      //execute the command
      function(next){
        logger.info('Executing command: ' + cmd + ' ' + args.join(' '))
        var q = cp.spawn(cmd,args)
        q.stdout.setEncoding('utf-8')
        q.stdout.on('data',function(data){
          logger.info(data)
        })
        q.stderr.setEncoding('utf-8')
        q.stderr.on('data',function(data){
          logger.warning(data)
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
      if(err) return done(err)
      done()
    }
  )
}
