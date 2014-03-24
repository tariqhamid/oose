'use strict';
var cluster = require('cluster')
  , os = require('os')
  , config = require('./config')

//master startup
if(cluster.isMaster){
  //start mesh for discovery and communication
  require('./mesh').start()
  var workers = config.get('workers') || os.cpus().length
  console.log('Starting ' + workers + ' workers')
  //start workers
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
