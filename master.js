'use strict';
var async = require('async')
var program = require('commander')
var debug = require('debug')('oose:master')
var fs = require('graceful-fs')
var mkdirp = require('mkdirp')

var Child = require('./helpers/child')
var lifecycle = new (require('./helpers/lifecycle'))()
var Logger = require('./helpers/logger')
var redis = require('./helpers/redis')
var logger = Logger.create('main')
var Workers = require('./helpers/workers')

var child = Child.parent
var once = Child.fork

var announce = child('./announce')
var clone = child('./clone')
var locate = child('./locate')
var peerNext = child('./collectors/peerNext')
var peerStats = child('./collectors/peerStats')
var ping = child('./ping')
var shredder = child('./shredder')
var supervisor = child('./supervisor')

var config = require('./config')

var workers = new Workers(config.workers.count,'./worker.js')

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


/**
 * Touch root to ensure existence
 */
lifecycle.add(function(next){
  debug('ensure root folder exists')
  var root = config.root
  fs.exists(root,function(exists){
    if(exists) return next()
    debug('creating root folder')
    mkdirp(root,next)
  })
})


/**
 * Remove any existing keys from redis
 */
lifecycle.add(function(next){
  debug('starting to cleanup redis')
  var removed = 0
  var done = function(next){
    return function(err,count){
      removed = removed + count
      next()
    }
  }
  async.series([
    function(next){redis.removeKeysPattern('peer:*',done(next))},
    function(next){redis.removeKeysPattern('prism:*',done(next))},
    function(next){redis.removeKeysPattern('inventory*',done(next))}
  ],function(err){
    if(err) return next(err)
    debug('finished clearing redis, removed ' + removed + ' keys')
    next()
  })
})


/**
 * Inventory filesystem
 */
if(config.store.enabled){
  lifecycle.add(function(next){
    debug('Executing inventory')
    once('./tasks/inventory',next)
  })
}


/**
 * Collect stats about the peer if we can
 */
if(config.announce.enabled){
  lifecycle.add(
    function(next){
      debug('Starting stats collection')
      peerStats.start(next)
    },
    function(next){
      debug('Stopping stats collection')
      peerStats.stop(next)
    }
  )
}


/**
 * Ping system
 */
if(config.ping.enabled){
  lifecycle.add(
    function(next){
      logger.info('Starting ping')
      ping.start(next)
    },
    function(next){
      logger.info('Stopping ping')
      ping.stop(next)
    }
  )
}


/**
 * Announce system
 */
if(config.announce.enabled){
  lifecycle.add(
    function(next){
      logger.info('Starting announce')
      announce.start(next)
    },
    function(next){
      logger.info('Stopping announce')
      announce.stop(next)
    }
  )
}


/**
 * Peer next selection
 */
if(config.announce.enabled){
  lifecycle.add(
    function(next){
      logger.info('Starting next peer selection')
      peerNext.start(next)
    },
    function(next){
      logger.info('Stopping next peer selection')
      peerNext.stop(next)
    }
  )
}


/**
 * Supervisor
 */
if(config.supervisor.enabled){
  lifecycle.add(
    function(next){
      logger.info('Starting supervisor')
      supervisor.start(next)
    },
    function(next){
      logger.info('Stopping supervisor')
      supervisor.stop(next)
    }
  )
}


/**
 * Workers
 */
if(config.workers.enabled && require.main !== module){
  lifecycle.add(
    function(next){
      logger.info('Starting workers')
      workers.start(next)
    },
    function(next){
      logger.info('Stopping workers')
      workers.stop(next)
    }
  )
} else {
  logger.info('Workers disabled, maybe we are in standalone mode?')
}


/**
 * Clone receiver
 */
if(config.store.enabled){
  lifecycle.add(
    function(next){
      logger.info('Starting clone system')
      clone.start(next)
    },
    function(next){
      logger.info('Stopping clone system')
      clone.stop(next)
    }
  )
}


/**
 * Locate system
 */
if(config.locate.enabled){
  lifecycle.add(
    function(next){
      logger.info('Starting locate')
      locate.start(next)
    },
    function(next){
      logger.info('Stopping locate')
      locate.stop(next)
    }
  )
}


/**
 * Shredder
 */
if(config.shredder.enabled){
  lifecycle.add(
    function(next){
      logger.info('Starting shredder')
      shredder.start(next)
    },
    function(next){
      logger.info('Stopping shredder')
      shredder.stop(next)
    }
  )
}


/**
 * Start master
 * @param {function} done
 */
exports.start = function(done){
  lifecycle.start(
    function(err){
      if(err){
        logger.error('Startup failed: ' + err)
        done(err)
        return
      }
      //go to ready state 3
      logger.info('Startup complete')
      done()
    }
  )
}


/**
 * Stop master
 * @param {function} done
 */
exports.stop = function(done){
  //register force kill for the second
  process.on('SIGTERM',process.exit)
  process.on('SIGINT',process.exit)
  //start the shutdown process
  logger.info('Beginning shutdown')
  lifecycle.stop(function(err){
    if(err){
      logger.error('Shutdown failed: ' + err)
      return done(err)
    } else {
      logger.info('Shutdown complete')
      done()
    }
  })
}

if(require.main === module){
  var master = exports
  Child.child(
    'oose:master',
    function(done){
      master.start(done)
    },
    function(done){
      master.stop(done)
    }
  )
}
