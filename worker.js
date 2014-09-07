'use strict';
var async = require('async')
var mongoose = require('mongoose')

var logger = require('./helpers/logger').create('worker')

var config = require('./config')
var storeExport = require('./export')
var executioner = require('./executioner')
var gump = require('./gump')
var hideout = require('./hideout')
var storeImport = require('./import')
var lg = require('./lg')
var prism = require('./prism')


/**
 * Set process title
 * @type {string}
 */
process.title = 'oose:worker'


/**
 * Start worker
 */
exports.start = function(){
  async.parallel(
    [
      function(next){
        if(config.store.enabled)
          storeImport.start(next)
        else next()
      },
      function(next){
        if(config.store.enabled)
          storeExport.start(next)
        else next()
      },
      function(next){
        if(config.prism.enabled)
          prism.start(next)
        else next()
      },
      function(next){
        if(config.mongoose.enabled){
          mongoose.connect(config.mongoose.dsn,config.mongoose.options,next)
        } else next()
      },
      function(next){
        if(config.mongoose.enabled && config.gump.enabled){
          gump.start(next)
        } else next()
      },
      function(next){
        if(config.mongoose.enabled && config.hideout.enabled){
          hideout.start(next)
        } else next()
      },
      function(next){
        if(config.lg.enabled){
          lg.start(next)
        } else next()
      },
      function(next){
        if(config.mongoose.enabled && config.executioner.enabled){
          executioner.start(next)
        } else next()
      }
    ],
    function(err){
      if(err) logger.error(err)
      //worker startup complete
    }
  )
  var workerShutdown = function(){
    async.parallel(
      [
        function(next){
          if(config.store.enabled)
            storeImport.stop(next)
          else next()
        },
        function(next){
          if(config.store.enabled)
            storeExport.stop(next)
          else next()
        },
        function(next){
          if(config.prism.enabled)
            prism.stop(next)
          else next()
        },
        function(next){
          if(config.gump.enabled)
            gump.stop(next)
          else next()
        },
        function(next){
          if(config.hideout.enabled)
            hideout.stop(next)
          else next()
        },
        function(next){
          if(config.lg.enabled)
            lg.stop(next)
          else next()
        },
        function(next){
          if(config.executioner.enabled){
            executioner.stop(next)
          } else next()
        }
      ],
      function(err){
        if(err) throw err
        process.exit(0)
      }
    )
  }
  process.on('message',function(message){
    if('shutdown' === message) workerShutdown()
  })
  process.on('SIGINT',function(){})
}
