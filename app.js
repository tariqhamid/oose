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
  var redis = require('./helpers/redis')
    , jobs = require('./helpers/jobs')
    , communicator = require('./helpers/communicator')
    , peerNext = require('./tasks/peerNext')
    , peerStats = require('./tasks/peerStats')
    , mesh = require('./mesh')
  //make sure the root folder exists
  if(!fs.existsSync(config.get('root'))){
    mkdirp.sync(config.get('root'))
  }
  //flush redis before startup
  redis.flushdb()
  //start booting
  var conn = {}
  async.series(
    [
      //start connections
      function(done){
        logger.info('Starting network connections')
        conn = {
          udp: communicator.UDP({
            port: config.get('mesh.port'),
            address: config.get('mesh.address'),
            multicast: {
              address: config.get('mesh.multicast.address'),
              ttl: config.get('mesh.multicast.ttl'),
              interfaceAddress: config.get('mesh.multicast.interfaceAddress')
            }
          }),
          tcp: communicator.TCP({port: config.get('mesh.port')})
        }
        //connection error handling
        conn.udp.on('error',logger.error)
        conn.tcp.on('error',logger.error)
        done()
      },
      //start stats collection
      function(done){
        logger.info('Starting stats collection')
        peerStats.start(
          config.get('mesh.interval.stat'),
          0,
          done
        )
      },
      //start next peer selection (delay)
      function(done){
        logger.info('Starting next-peer selector')
        peerNext.start(
          config.get('mesh.interval.peerNext'),
          config.get('mesh.interval.announce') * 2,
          done
        )
      },
      //start mesh for discovery and communication
      function(done){
        mesh.start(conn,function(){
          logger.info('Mesh started')
          done()
        })
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
      if(!err){
        //register job handlers
        jobs.process('inventory',require('./tasks/inventory'))
        jobs.process('prismSync',require('./tasks/prismSync'))
        jobs.process('replicate',require('./tasks/replicate'))
        //fire off initial scan
        if(config.get('store.enabled'))
          jobs.create('inventory',{title: 'Build the initial hash table', root: config.get('root')}).save()
        //start workers
        var workers = config.get('workers') || os.cpus().length
        logger.info('Starting ' + workers + ' workers')
        for(var i=1; i <= workers; i++){
          logger.info('starting worker ' + i)
          cluster.fork()
        }
      }
    }
  )
  var shutdown = function(){
    async.series(
      [
        //stop workers
        function(done){
          logger.info('Stopping all workers')
          cluster.disconnect(function(){done()})
          done()
        },
        //stop mesh
        function(done){
          logger.info('Stopping Mesh')
          mesh.stop(done)
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
        //stop network connections
        function(done){
          logger.info('Stopping network connections')
          conn.tcp.close()
          conn.udp.close()
          done()
        }
      ],
      function(){ logger.info('STOPPED.') }
    )
  }
  process.on('SIGINT',shutdown)
  process.on('SIGTERM',shutdown)
}

//worker startup
if(cluster.isWorker){
  logger.info('Worker starting...')
  //start storage services
  if(config.get('store.enabled')){
    require('./import').start(function(){
      logger.info(
        'Import listening on ' +
        (config.get('store.import.host') || 'localhost') +
        ':' +
        config.get('store.import.port')
      )
    })
    require('./export').start(function(){
      logger.info(
        'Export listening on ' +
        (config.get('store.export.host') || 'localhost') +
        ':' +
        config.get('store.export.port')
      )
    })
  }
  //start resolve if its enabled
  if(config.get('prism.enabled')){
    require('./prism').start(function(){
      logger.info('Prism listening on ' + (config.get('prism.host') || 'localhost') + ':' + config.get('prism.port'))
    })
  }
}
