'use strict';
var cluster = require('cluster')
  , os = require('os')
  , kue = require('kue')
  , config = require('./config')
  , fs = require('fs')
  , mkdirp = require('mkdirp')


//master startup
if(cluster.isMaster){
  //make sure the root folder exists
  if(!fs.existsSync(config.get('root'))){
    mkdirp.sync(config.get('root'))
  }
  //start mesh for discovery and communication
  require('./mesh').start()
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
  for(var i=0; i < workers; i++){
    cluster.fork()
  }
}

//worker startup
if(cluster.isWorker){
  console.log('Worker starting...')
  //start serve if its enabled
  if(config.get('serve.enabled')){
    require('./serve').start()
  }
  //start resolve if its enabled
  if(config.get('resolve.enabled')){
    require('./resolve').start()
  }
}
