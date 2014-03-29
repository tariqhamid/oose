'use strict';
var cluster = require('cluster')
  , os = require('os')
  , config = require('./config')
  , fs = require('fs')
  , mkdirp = require('mkdirp')
  , logger = require('./helpers/logger')


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
  //start mesh for discovery and communication
  require('./mesh').start(function(){
    logger.info('Mesh started and announcing')
  })
  //start the supervisor
  require('./supervisor').start(function(){
    logger.info('Supervisor started')
  })

  //register job handlers
  jobs.process('inventory',require('./tasks/inventory'))
  jobs.process('prismSync',require('./tasks/prismSync'))
  jobs.process('replicate',require('./tasks/replicate'))
  //fire off initial scan
  if(config.get('store.enabled'))
    jobs.create('inventory',{title: 'Build the initial hash table', root: config.get('root')}).save()
  //start workers
  var workers = config.get('workers') || os.cpus().length
  console.log('Starting ' + workers + ' workers')
  for(var i=1; i <= workers; i++){
    logger.info('starting worker ' + i)
    cluster.fork()
  }
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
