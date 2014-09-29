'use strict';
var async = require('async')
var program = require('commander')
var debug = require('debug')('oose:master')
var fs = require('graceful-fs')
var Child = require('infant').Child
var lifecycle = new (require('infant').Lifecycle)()
var mkdirp = require('mkdirp')

var Logger = require('./helpers/logger')
var redis = require('./helpers/redis')
var logger = Logger.create('main')

var child = Child.parent
var once = Child.fork

var announce = child('./announce')
var clone = child('./clone')
var executioner = child('./executioner')
var storeExport = child('./export')
var gump = child('./gump')
var hideout = child('./hideout')
var storeImport = child('./import')
var lg = child('./lg')
var locate = child('./locate')
var peerNext = child('./collectors/peerNext')
var peerStats = child('./collectors/peerStats')
var ping = child('./ping')
var prism = child('./prism')
var shredder = child('./shredder')
var supervisor = child('./supervisor')

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
 * Remove any existing keys from redis
 */
lifecycle.add(
  'redis cleanup',
  function(next){
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
  }
)


/**
 * Inventory filesystem
 */
if(config.store.enabled){
  lifecycle.add(
    'inventory build',
    function(next){
      once('./tasks/inventory',next)
    }
  )
}


/**
 * Collect stats about the peer if we can
 */
if(config.announce.enabled){
  lifecycle.add(
    'peer stats',
    function(next){
      peerStats.start(next)
    },
    function(next){
      peerStats.stop(next)
    }
  )
}


/**
 * Ping system
 */
if(config.ping.enabled){
  lifecycle.add(
    'ping',
    function(next){
      ping.start(next)
    },
    function(next){
      ping.stop(next)
    }
  )
}


/**
 * Announce system
 */
if(config.announce.enabled){
  lifecycle.add(
    'announce',
    function(next){
      announce.start(next)
    },
    function(next){
      announce.stop(next)
    }
  )
}


/**
 * Peer next selection
 */
if(config.announce.enabled){
  lifecycle.add(
    'next peer selection',
    function(next){
      peerNext.start(next)
    },
    function(next){
      peerNext.stop(next)
    }
  )
}


/**
 * Supervisor
 */
if(config.supervisor.enabled){
  lifecycle.add(
    'supervisor',
    function(next){
      supervisor.start(next)
    },
    function(next){
      supervisor.stop(next)
    }
  )
}


/**
 * Import
 */
if(config.store.enabled){
  lifecycle.add(
    'import',
    function(next){
      storeImport.start(next)
    },
    function(next){
      storeImport.stop(next)
    }
  )
}


/**
 * Export
 */
if(config.store.enabled){
  lifecycle.add(
    'export',
    function(next){
      storeExport.start(next)
    },
    function(next){
      storeExport.stop(next)
    }
  )
}


/**
 * Executioner
 */
if(config.executioner.enabled){
  lifecycle.add(
    'executioner',
    function(next){
      executioner.start(next)
    },
    function(next){
      executioner.stop(next)
    }
  )
}


/**
 * Gump
 */
if(config.gump.enabled){
  lifecycle.add(
    'gump',
    function(next){
      gump.start(next)
    },
    function(next){
      gump.stop(next)
    }
  )
}


/**
 * Hideout
 */
if(config.hideout.enabled){
  lifecycle.add(
    'hideout',
    function(next){
      hideout.start(next)
    },
    function(next){
      hideout.stop(next)
    }
  )
}


/**
 * LG
 */
if(config.lg.enabled){
  lifecycle.add(
    'lg',
    function(next){
      lg.start(next)
    },
    function(next){
      lg.stop(next)
    }
  )
}


/**
 * Locate system
 */
if(config.locate.enabled){
  lifecycle.add(
    'locate',
    function(next){
      locate.start(next)
    },
    function(next){
      locate.stop(next)
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
    'oose:master',
    function(done){
      master.start(done)
    },
    function(done){
      master.stop(done)
    }
  )
}
