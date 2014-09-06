'use strict';
//fix windows handling of ctrl+c
require('node-sigint')

var async = require('async')
var cluster = require('cluster')
var program = require('commander')
//var debug = require('debug')('oose:master')
var fs = require('graceful-fs')
var mkdirp = require('mkdirp')
var os = require('os')

var Child = require('./helpers/child')
var Logger = require('./helpers/logger')
var redis = require('./helpers/redis')
var logger = Logger.create('main')

var clone = new Child('./clone')
var peerNext = new Child('./collectors/peerNext')
var peerStats = new Child('./collectors/peerStats')
var mesh = new Child('./mesh')
var shredder = new Child('./shredder')
var supervisor = new Child('./supervisor')

var config = require('./config')


/**
 * Start master
 */
exports.start = function(){
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
  )
    .parse(process.argv)

  //set log verbosity
  Logger.consoleFilter.setConfig({level: (program.verbose || 0) + 4})

  //start booting
  async.series(
    [
      //make sure the root folder exists
      function(next){
        var root = config.root
        fs.exists(root,function(exists){
          if(exists) return next()
          mkdirp(root,next)
        })
      },
      //cleanup redis
      function(next){
        var removed = 0
        var removeKeys = function(pattern,next){
          redis.keys(pattern,function(err,keys){
            async.eachSeries(
              keys,
              function(key,next){
                redis.del(key,function(err,count){removed += count; next(err)})
              },
              next
            )
          })
        }
        async.series([
          function(next){removeKeys('peer:*',next)},
          function(next){removeKeys('prism:*',next)},
          function(next){removeKeys('inventory*',next)}
        ],function(err){
          if(err) return next(err)
          logger.info('Cleared ' + removed + ' keys from redis')
          next()
        })
      },
      //inventory files first if store is enabled
      function(next){
        if(!config.store.enabled) return next()
        Child.fork('./tasks/inventory',next)
      },
      //start collectors
      function(next){
        if(config.mesh.enabled && config.mesh.stat.enabled){
          logger.info('Starting stats collection')
          peerStats.start(next)
        } else next()
      },
      //start mesh
      function(next){
        if(config.mesh.enabled){
          logger.info('Starting mesh')
          var restartDelay = 1000
          var restart = function(){
            mesh.start(function(err){
              if(err) logger.error('Child restart error:',err)
              else logger.info('Child restarted')
            })
          }
          mesh.on('error',function(err){
            logger.error('Child failed:',err)
            setTimeout(restart,restartDelay)
          })
          mesh.on('exit',function(code){
            logger.error('Child exited with code:',code)
            setTimeout(restart,restartDelay)
          })
          mesh.on('close',function(){
            logger.error('Child closed?')
            setTimeout(restart,restartDelay)
          })
          mesh.start(next)
        } else next()
      },
      //go to ready state 1
      function(next){
        logger.info('Going to readyState 1')
        mesh.send({readyState: 1})
        next()
      },
      //start next peer selection
      function(next){
        if(config.mesh.enabled && config.mesh.peerNext.enabled){
          logger.info('Starting next peer selection')
          peerNext.start(next)
        } else next()
      },
      //go to ready state 2
      function(next){
        logger.info('Going to readyState 2')
        mesh.send({readyState: 2})
        next()
      },
      //start the supervisor
      function(next){
        if(config.supervisor.enabled){
          logger.info('Starting supervisor')
          supervisor.start(next)
        } else next()
      },
      //start Clone handler
      function(next){
        if(config.store.enabled){
          logger.info('Starting clone system')
          clone.start(function(err){
            if(!err){
              logger.info('Cloning system started')
              next()
            } else next(err)
          })
        } else next()
      },
      //start Shredder
      function(next){
        if(config.shredder.enabled){
          logger.info('Starting shredder')
          shredder.start(function(err){
            if(!err){
              logger.info('Shredder started')
              next()
            } else next(err)
          })
        } else next()
      }
    ],
    function(err){
      if(err){
        logger.error('Startup failed: ' + err)
        process.exit()
      }
      if(!config.workers.enabled){
        logger.info('Not starting workers, they are disabled')
        return
      }
      //start workers
      var workerCount = config.workers.count || os.cpus().length || 4
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
          mesh.send({readyState: 3})
        }
      })
      //worker recovery
      cluster.on('exit',function(worker,code,signal){
        if(0 !== code){
          logger.info(
            'Worker ' + worker.id + ' died (' + (signal || code) + ') restarted'
          )
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
        //stop shredder
        function(next){
          if(config.shredder.enabled){
            logger.info('Stopping shredder')
            shredder.stop(next)
          } else next()
        },
        //stop clone
        function(next){
          if(config.shredder.enabled){
            logger.info('Stopping clone system')
            clone.stop(next)
          } else next()
        },
        //go to ready state 5
        function(next){
          logger.info('Going to readyState 5')
          mesh.send({readyState: 5})
          next()
        },
        //message workers to shutdown
        function(next){
          if(config.workers.enabled){
            logger.info('Stopping all workers')
            for(var id in cluster.workers){
              if(cluster.workers.hasOwnProperty(id))
                cluster.workers[id].send('shutdown')
            }
            next()
          } else next()
        },
        //stop workers
        function(next){
          if(config.workers.enabled){
            //wait for the workers to all die
            var checkWorkerCount = function(){
              if(!cluster.workers) return next()
              if(Object.keys(cluster.workers).length){
                logger.info(
                  'Waiting on ' + Object.keys(cluster.workers).length +
                  ' workers to exit'
                )
                setTimeout(checkWorkerCount,1000)
              } else {
                logger.info('Workers have stopped')
                next()
              }
            }
            checkWorkerCount()
          } else next()
        },
        //stop next peer selection
        function(next){
          if(config.mesh.enabled && config.mesh.peerNext.enabled){
            logger.info('Stopping next peer selection')
            peerNext.stop(next)
          } else next()
        },
        //stats
        function(next){
          if(config.mesh.enabled && config.mesh.stat.enabled){
            logger.info('Stopping self stat collection')
            peerStats.stop(next)
          } else next()
        },
        //go to ready state 0
        function(next){
          logger.info('Going to readyState 0')
          mesh.send({readyState: 0})
          next()
        },
        //stop mesh
        function(next){
          if(config.mesh.enabled){
            logger.info('Stopping mesh')
            mesh.stop(next)
          } else next()
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
