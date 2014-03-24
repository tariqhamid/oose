'use strict';
var cluster = require('cluster')
  //, redis = require('./helpers/redis')
  , os = require('os')
  , mesh = require('./mesh')
  , config = require('./config')
  , serve = require('./serve')
  , resolve = require('./resolve')

if(cluster.isMaster){
  //start mesh for discovery and communication
  mesh.start()
  var workers = config.get('workers') || os.cpus().length
  //start workers
  for(var i=0; i < workers; i++){
    cluster.fork()
  }
} else {
  //worker startup
  //start serve if its enabled
  if(config.get('serve.enabled')){
    //serve.start()
  }
  //start resolve if its enabled
  if(config.get('resolve.enabled')){
    //resolve.start()
  }
}
