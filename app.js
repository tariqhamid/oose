'use strict';
var debug = require('debug')('oose:main')
var fs = require('graceful-fs')
var Child = require('infant').Child
var lifecycle = new (require('infant').Lifecycle)()
var mkdirp = require('mkdirp-then')

var child = Child.parent

var admin = child('./admin')
var master = child('./master')
var prism = child('./prism')
var store = child('./store')

var config = require('./config')

//setup lifecycle logging
lifecycle.on('start',function(item){
  console.log('Starting ' + item.title)
})
lifecycle.on('stop',function(item){
  console.log('Stopping ' + item.title)
})
lifecycle.on('online',function(){
  console.log('Startup complete')
})
lifecycle.on('offline',function(){
  console.log('Shutdown complete')
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
 * Admin
 */
if(config.admin.enabled){
  lifecycle.add(
    'admin',
    function(next){
      admin.start(next)
    },
    function(next){
      admin.stop(next)
    }
  )
}


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
  console.log('Beginning startup')
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
  console.log('Beginning shutdown')
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
