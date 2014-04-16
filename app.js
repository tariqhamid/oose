'use strict';
var cluster = require('cluster')
  , os = require('os')
  , config = require('./config')
  , fs = require('fs')
  , mkdirp = require('mkdirp')
  , logger = require('./helpers/logger')
  , async = require('async')

//master startup
if(cluster.isMaster){
  require('node-sigint')
  var redis = require('./helpers/redis')
    , peerNext = require('./collectors/peerNext')
    , peerStats = require('./collectors/peerStats')
    , mesh = require('./mesh')
    , ping = require('./mesh/ping')
    , announce = require('./mesh/announce')
    , workers = []
  //make sure the root folder exists
  if(!fs.existsSync(config.get('root')))
    mkdirp.sync(config.get('root'))
  //flush redis before startup
  redis.flushdb()
  //start booting
  async.series(
    [
      //start mesh
      function(done){
        logger.info('Starting mesh')
        mesh.start(done)
      },
      //go to ready state 1
      function(done){
        logger.info('Going to readyState 1')
        mesh.readyState(1,done)
      },
      //start collectors
      function(done){
        logger.info('Starting stats collection')
        peerStats.start(config.get('mesh.interval.stat'),0)
        peerStats.once('loopEnd',function(){done()})
      },
      //start ping
      function(done){
        logger.info('Starting ping')
        ping.start(done)
      },
      //go to ready state 2
      function(done){
        logger.info('Going to readyState 2')
        mesh.readyState(2,done)
      },
      //start announce
      function(done){
        logger.info('Starting announce')
        announce.start(done)
      },
      //start next peer selection
      function(done){
        logger.info('Starting next peer selection')
        peerNext.start(config.get('mesh.interval.peerNext'),config.get('mesh.interval.announce') * 2,done)
      },
      //start the supervisor
      function(done){
        if(config.get('supervisor.enabled')){
          require('./supervisor').start(function(){
            logger.info('Supervisor started')
            done()
          })
        } else done()
      }
    ],
    function(err){
      if(err){
        logger.error('Startup failed: ' + err)
        process.exit()
      }
      //fire off initial scan
      if(config.get('store.enabled')){
        require('./tasks/inventory').start(function(err,fileCount){
          if(err) logger.error(err)
          else logger.info('[Inventory] Initial inventory is completed and read ' + fileCount + ' files')
        })
      }
      //start workers
      var workerCount = config.get('workers') || os.cpus().length
      logger.info('Starting ' + workers + ' workers')
      for(var i=1; i <= workerCount; i++){
        workers.push(cluster.fork())
      }
      //worker online notification
      var workerOnlineCount = 0
      cluster.on('online',function(worker){
        logger.info('Worker ' + worker.id + ' online')
        workerOnlineCount++
        if(workerOnlineCount >= workerCount){
          //go to ready state 3
          logger.info('Going to readyState 3')
          mesh.readyState(3)
        }
      })
      //worker recovery
      cluster.on('exit',function(worker,code,signal){
        if(0 === code){
          workers.splice(workers.indexOf(worker),1)
        } else {
          logger.info('Worker ' + worker.id + ' died (' + (signal || code) + ') restarted')
          //remove the worker from the handles array
          workers.splice(workers.indexOf(worker),1)
          //start the new worker
          workers.push(cluster.fork())
        }
      })
    }
  )
  var shutdownAttempted = false
  var shutdown = function(){
    //register force kill for the second
    process.on('SIGINT',function(){
      process.exit()
    })
    //start the shutdown process
    logger.info('Beginning shutdown')
    async.series(
      [
        //go to ready state 5
        function(done){
          logger.info('Going to readyState 5')
          mesh.readyState(5,done)
        },
        //stop workers
        function(done){
          logger.info('Stopping all workers')
          //wait for the workers to all die
          var checkWorkerCount = function(){
            if(workers.length){
              logger.info('Waiting on ' + workers.length + ' to exit')
              setTimeout(checkWorkerCount,100)
            } else done()
          }
          checkWorkerCount()
        },
        //stop announce
        function(done){
          logger.info('Stopping announce')
          announce.stop(done)
        },
        //stop ping
        function(done){
          logger.info('Stopping ping')
          ping.stop(done)
        },
        //stop next peer selection
        function(done){
          logger.info('Stopping next peer selection')
          peerNext.stop(done)
        },
        //stats
        function(done){
          logger.info('Stopping self stat collection')
          peerStats.stop(done)
        },
        //go to ready state 0
        function(done){
          logger.info('Going to readyState 0')
          mesh.readyState(0,done)
        },
        //stop mesh
        function(done){
          logger.info('Stopping mesh')
          mesh.stop(done)
        }
      ],
      function(err){
        if(err && !shutdownAttempted){
          shutdownAttempted = true
          logger.error('Shutdown failed: ' + err)
        } else if(err && shutdownAttempted){
          logger.error('Shutdown failed: ' + err)
          logger.error('Shutdown already failed once, forcing exit')
          process.exit()
        } else {
          logger.info('Stopped')
          process.exit()
        }
      }
    )
  }
  process.once('SIGINT',shutdown)
  process.once('SIGTERM',shutdown)
}

//worker startup
if(cluster.isWorker){
  var storeImport = require('./import')
    , storeExport = require('./export')
    , prism = require('./prism')
  async.parallel(
    [
      function(next){
        if(config.get('store.enabled'))
          storeImport.start(next)
        else next()
      },
      function(next){
        if(config.get('store.enabled'))
          storeExport.start(next)
        else next()
      },
      function(next){
        if(config.get('prism.enabled'))
          prism.start(next)
        else next()
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
        function(next){storeImport.stop(next)},
        function(next){storeExport.stop(next)},
        function(next){prism.stop(next)}
      ],
      function(err){
        if(err) throw err
        process.exit(0)
      }
    )
  }
  process.on('SIGINT',workerShutdown)
}
