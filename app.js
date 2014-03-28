'use strict';
var cluster = require('cluster')
  , os = require('os')
  , kue = require('kue')
  , config = require('./config')
  , fs = require('fs')
  , mkdirp = require('mkdirp')
  , logger = require('./helpers/logger')


//master startup
if(cluster.isMaster){
  //make sure the root folder exists
  if(!fs.existsSync(config.get('root'))){
    mkdirp.sync(config.get('root'))
  }
  //start mesh for discovery and communication
  require('./mesh').start(function(){
    logger.info('Mesh started and announcing')
  })
  //start the supervisor
  require('./supervisor').start(function(){
    logger.info('Supervisor started')
  })
  //setup kue
  if(config.get('kue.port')){
    kue.app.set('title',config.get('kue.title') || 'OOSE Tasks')
    kue.app.listen(config.get('kue.port'),config.get('kue.port'))
  }
  var jobs = kue.createQueue(config.get('kue.options'))
  //register job handlers
  jobs.process('hashInventory',require('./tasks/hashInventory'))
  jobs.process('prismSync',require('./tasks/prismSync'))
  //fire off initial scan
  if(config.get('export.enabled'))
    jobs.create('hashInventory',{title: 'Build the initial hash table', root: config.get('root')}).save()
  if(config.get('prism.enabled'))
    jobs.create('prismSync',{title: 'Sync or build the global hash table', hostname: config.get('hostname')}).save()
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
  //start tcp import
  if(config.get('import.enabled')){
    require('./import').start(function(){
      logger.info('Import listening on ' + (config.get('import.host') || 'localhost') + ':' + config.get('import.port'))
    })
  }
  //start export if its enabled
  if(config.get('export.enabled')){
    require('./export').start(function(){
      logger.info('Export listening on ' + (config.get('export.host') || 'localhost') + ':' + config.get('export.port'))
    })
  }
  //start resolve if its enabled
  if(config.get('prism.enabled')){
    require('./prism').start(function(){
      logger.info('Prism listening on ' + (config.get('prism.host') || 'localhost') + ':' + config.get('prism.port'))
    })
  }
}
