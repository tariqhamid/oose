'use strict';
var cluster = require('cluster')

//master startup
if(cluster.isMaster){
  var master = require('./master')
  master.start(0)
}

//worker startup
if(cluster.isWorker){
  var worker = require('./worker')
  worker.start()
}
