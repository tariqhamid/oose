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
  //make sure the root folder exists
  if(!fs.existsSync(config.get('root')))
    mkdirp.sync(config.get('root'))
  //flush redis before startup
  redis.flushdb()
  //start booting
  async.series(
    [
      //start mesh
      function(next){
        logger.info('Starting mesh')
        mesh.start(next)
      },
      //go to ready state 1
      function(next){
        logger.info('Going to readyState 1')
        mesh.readyState(1,next)
      },
      //start collectors
      function(next){
        logger.info('Starting stats collection')
        peerStats.start(config.get('mesh.interval.stat'),0)
        peerStats.once('loopEnd',function(){next()})
      },
      //start ping
      function(next){
        logger.info('Starting ping')
        ping.start(next)
      },
      //go to ready state 2
      function(next){
        logger.info('Going to readyState 2')
        mesh.readyState(2,next)
      },
      //start announce
      function(next){
        logger.info('Starting announce')
        announce.start(next)
      },
      //start next peer selection
      function(next){
        logger.info('Starting next peer selection')
        peerNext.start(config.get('mesh.interval.peerNext'),config.get('mesh.interval.announce') * 2,next)
      },
      //start the supervisor
      function(next){
        if(config.get('supervisor.enabled')){
          require('./supervisor').start(function(){
            logger.info('Supervisor started')
            next()
          })
        } else next()
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
      logger.info('Starting ' + workerCount + ' workers')
      for(var i=1; i <= workerCount; i++) cluster.fork()
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
        if(0 !== code){
          logger.info('Worker ' + worker.id + ' died (' + (signal || code) + ') restarted')
          //start the new worker
          cluster.fork()
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
        function(next){
          logger.info('Going to readyState 5')
          mesh.readyState(5,next)
        },
        //message workers to shutdown
        function(next){
          logger.info('Stopping all workers')
          for(var id in cluster.workers){
            if(cluster.workers.hasOwnProperty(id))
              cluster.workers[id].send('shutdown')
          }
          next()
        },
        //stop workers
        function(next){
          //wait for the workers to all die
          var checkWorkerCount = function(){
            if(cluster.workers.length){
              logger.info('Waiting on ' + cluster.workers.length + ' to exit')
              setTimeout(checkWorkerCount,1000)
            } else next()
          }
          checkWorkerCount()
        },
        //stop announce
        function(next){
          logger.info('Stopping announce')
          announce.stop(next)
        },
        //stop ping
        function(next){
          logger.info('Stopping ping')
          ping.stop(next)
        },
        //stop next peer selection
        function(next){
          logger.info('Stopping next peer selection')
          peerNext.stop(next)
        },
        //stats
        function(next){
          logger.info('Stopping self stat collection')
          peerStats.stop(next)
        },
        //go to ready state 0
        function(next){
          logger.info('Going to readyState 0')
          mesh.readyState(0,next)
        },
        //stop mesh
        function(next){
          logger.info('Stopping mesh')
          mesh.stop(next)
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
    , mongoose = require('mongoose')
    , embed = require('./embed')
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
      },
      function(next){
        if(!config.get('mongoose.enabled')) return next()
        mongoose.connect(config.get('mongoose.dsn'),config.get('mongoose.options'),next)
      },
      function(next){
        if(config.get('mongoose.enabled') && config.get('embed.enabled')){
          embed.start(next)
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
          if(config.get('store.enabled'))
            storeImport.stop(next)
          else next()
        },
        function(next){
          if(config.get('store.enabled'))
            storeExport.stop(next)
          else next()
        },
        function(next){
          if(config.get('prism.enabled'))
            prism.stop(next)
          else next()
        },
        function(next){
          if(config.get('embed.enabled'))
            embed.stop(next)
          else next()
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
