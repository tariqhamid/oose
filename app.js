'use strict';
var program = require('commander')
var debug = require('debug')('oose:master')
var fs = require('graceful-fs')
var Child = require('infant').Child
var lifecycle = new (require('infant').Lifecycle)()
var mkdirp = require('mkdirp')

var Logger = require('./helpers/logger')
var logger = Logger.create('main')

var child = Child.parent

var clone = child('./clone')
var ooseImport = child('./import')
var prism = child('./prism')
var shredder = child('./shredder')

var config = require('./config')

//parse cli
program
  .version(config.version)
  .option(
  '-v, --verbose',
  'Increase logging',
  function(v,total){
    return total + 1
  },
  0
).parse(process.argv)

//set log verbosity
debug('setting up console logging with level',+program.verbose)
Logger.consoleFilter.setConfig({level: (+program.verbose || 0) + 4})

//setup lifecycle logging
lifecycle.on('start',function(item){
  logger.info('Starting ' + item.title)
})
lifecycle.on('stop',function(item){
  logger.info('Stopping ' + item.title)
})
lifecycle.on('online',function(){
  logger.info('Startup complete')
})
lifecycle.on('offline',function(){
  logger.info('Shutdown complete')
})


/**
 * Touch root to ensure existence
 */
lifecycle.add(
  'pre init',
  function(next){
    debug('ensure root folder exists')
    var root = config.root
    fs.exists(root,function(exists){
      if(exists) return next()
      debug('creating root folder')
      mkdirp(root,next)
    })
  }
)


/**
 * Import
 */
if(config.store.enabled){
  lifecycle.add(
    'import',
    function(next){
      ooseImport.start(next)
    },
    function(next){
      ooseImport.stop(next)
    }
  )
}


/**
 * Prism
 */
if(config.lg.enabled){
  lifecycle.add(
    'prism',
    function(next){
      prism.start(next)
    },
    function(next){
      prism.stop(next)
    }
  )
}


/**
 * Clone receiver
 */
if(config.store.enabled){
  lifecycle.add(
    'clone',
    function(next){
      clone.start(next)
    },
    function(next){
      clone.stop(next)
    }
  )
}


/**
 * Shredder
 */
if(config.shredder.enabled){
  lifecycle.add(
    'shredder',
    function(next){
      shredder.start(next)
    },
    function(next){
      shredder.stop(next)
    }
  )
}


/**
 * Start master
 * @param {function} done
 */
exports.start = function(done){
  logger.info('Beginning startup')
  lifecycle.start(
    function(err){
      if(err) throw err
      done()
    }
  )
}


/**
 * Stop master
 * @param {function} done
 */
exports.stop = function(done){
  //start the shutdown process
  logger.info('Beginning shutdown')
  lifecycle.stop(function(err){
    if(err) throw err
    done()
  })
}

if(require.main === module){
  var master = exports
  Child.child(
    'oose:' + config.locale.id + ':master',
    function(done){
      master.start(done)
    },
    function(done){
      master.stop(done)
    }
  )
}
