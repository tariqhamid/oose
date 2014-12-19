'use strict';
var program = require('commander')
var debug = require('debug')('oose:main')
var fs = require('graceful-fs')
var Child = require('infant').Child
var lifecycle = new (require('infant').Lifecycle)()
var mkdirp = require('mkdirp-then')

var Logger = require('./helpers/logger')
var logger = Logger.create('main')

var child = Child.parent

var master = child('./master')
var prism = child('./prism')
var store = child('./store')

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
Logger.consoleFilter.setConfig({level: (+program.verbose || 2) + 4})

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
      mkdirp(root).then(function(){next()},next)
    })
  }
)


/**
 * Master
 */
if(config.master.enabled){
  lifecycle.add(
    'master',
    function(next){
      master.start(next)
    },
    function(next){
      master.stop(next)
    }
  )
}


/**
 * Prism
 */
if(config.prism.enabled){
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
 * Store
 */
if(config.store.enabled){
  lifecycle.add(
    'store',
    function(next){
      store.start(next)
    },
    function(next){
      store.stop(next)
    }
  )
}


/**
 * Start main
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
  Child.child(
    'oose:' + config.host + ':main',
    function(done){
      exports.start(done)
    },
    function(done){
      exports.stop(done)
    }
  )
}
