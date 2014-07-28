'use strict';
var async = require('async')
var command = require('command')
var config = require('../../config')


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
      var string = ''
      string += v.key
      string += v.join || ' '
      if(!v.value){
        parsed.push(string)
        return next()
      }
      v.value = parameter.render(v.value)
      resource.render(v.value,function(err,result){
        if(err) return next(err)
        v.value = result
        string += v.value
        parsed.push(string)
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
        command.open(config.get('shredder.root'))
          .on('stdout',function(data){
            logger.info(data)
          })
          .on('stderr',function(data){
            logger.error(data)
          })
          .exec(cmd,args)
          .then(function() {
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
