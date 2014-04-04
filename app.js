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
  //make sure the root folder exists
  if(!fs.existsSync(config.get('root'))){
    mkdirp.sync(config.get('root'))
  }
  //flush redis before startup
  redis.flushdb()
  //start booting
  async.series([
      //start stats collection
      function(done){
        logger.info('Starting self stat collection')
        require('./tasks/peerStats').start(
          config.get('mesh.interval.stat'),
          0,
          done
        )
      },
      //start next peer selection (delay)
      function(done){
        logger.info('Starting next peer selection')
        require('./tasks/peerNext').start(
          config.get('mesh.interval.peerNext'),
          config.get('mesh.interval.announce') * 2,
          done
        )
      },
      //start ping
      function(done){
        //start mesh for discovery and communication
        require('./mesh').start(function(){
          logger.info('Mesh started')
          done()
        })
      },
      //start announcements
      function(done){
        //start the supervisor
        if(config.get('supervisor.enabled')){
          require('./supervisor').start(function(){
            logger.info('Supervisor started')
            done()
          })
        } else done()
      }
    ],
    function(err,results){
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
