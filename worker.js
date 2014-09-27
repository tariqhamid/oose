'use strict';
var debug = require('debug')('oose:worker')
var child = require('infant').child
var lifecycle = new (require('infant').Lifecycle)()
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


//ignore process control (only listen to our master)
process.on('SIGINT',function(){})
process.on('SIGTERM',function(){})


/**
 * Mongoose
 */
if(config.mongoose.enabled){
  lifecycle.add(
    function(next){
      mongoose.connect(config.mongoose.dsn,config.mongoose.options,next)
    }
  )
}


/**
 * Store
 */
if(config.store.enabled){
  //import
  lifecycle.add(
    function(next){
      storeImport.start(next)
    },
    function(next){
      storeImport.stop(next)
    }
  )
  //export
  lifecycle.add(
    function(next){
      storeExport.start(next)
    },
    function(next){
      storeExport.stop(next)
    }
  )
}


/**
 * Prism
 */
if(config.prism.enabled){
  //import
  lifecycle.add(
    function(next){
      prism.start(next)
    },
    function(next){
      prism.stop(next)
    }
  )
}


/**
 * Gump
 */
if(config.mongoose.enabled && config.gump.enabled){
  lifecycle.add(
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
if(config.mongoose.enabled && config.hideout.enabled){
  lifecycle.add(
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
    function(next){
      lg.start(next)
    },
    function(next){
      lg.stop(next)
    }
  )
}


/**
 * Executioner
 */
if(config.mongoose.enabled && config.executioner.enabled){
  lifecycle.add(
    function(next){
      executioner.start(next)
    },
    function(next){
      executioner.stop(next)
    }
  )
}


/**
 * Start worker
 * @param {function} done
 */
exports.start = function(done){
  debug('worker starting')
  lifecycle.start(function(err){
    if(err){
      logger.error(err)
      done(err)
      return
    }
    debug('worker startup complete')
    done()
  })
}


/**
 * Stop worker
 * @param {function} done
 */
exports.stop = function(done){
  debug('worker stopping')
  lifecycle.stop(function(err){
    if(err){
      logger.error(err)
      done(err)
      return
    }
    debug('worker shutdown complete')
    done()
  })
}

if(require.main === module){
  var worker = exports
  child(
    'oose:worker',
    function(done){
      worker.start(done)
    },
    function(done){
      worker.stop(done)
    }
  )
}
