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
    console.log('Mesh started and announcement active')
  })
  //start the balancing act
  if(false !== config.get('balance.enabled') && true === config.get('serve.enabled')){
    require('./balance').start()
  }
  //setup kue
  if(config.get('kue.port')){
    kue.app.set('title',config.get('kue.title') || 'OOSE Tasks')
    kue.app.listen(config.get('kue.port'),config.get('kue.port'))
  }
  var jobs = kue.createQueue(config.get('kue.options'))
  //register job handlers
  jobs.process('hashInventory',require('./tasks/hashInventory'))
  jobs.process('resolveSync',require('./tasks/resolveSync'))
  //fire off initial scan
  if(config.get('serve.enabled'))
    jobs.create('hashInventory',{root: config.get('root')})
  if(config.get('resolve.enabled'))
    jobs.create('resolveSync',{hostname: config.get('hostname')})
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
  //start serve if its enabled
  if(config.get('serve.enabled')){
    require('./serve').start(function(){
      logger.info('Serve listening on ' + (config.get('serve.host') || 'localhost') + ':' + config.get('serve.port'))
    })
  }
  //start resolve if its enabled
  if(config.get('resolve.enabled')){
    require('./resolve').start(function(){
      logger.info('Resolve listening on ' + (config.get('resolve.host') || 'localhost') + ':' + config.get('resolve.port'))
    })
  }
  //start tcp import
  if(config.get('import.enabled')){
    require('./import').start(function(){
      logger.info('Import listening on ' + (config.get('import.host') || 'localhost') + ':' + config.get('import.port'))
    })
  }
}
