'use strict';
var cluster = require('cluster')

//master startup
if(cluster.isMaster){
  process.title = 'OOSE: master'
  var master = require('./master')
  master.start(0)
}

//worker startup
if(cluster.isWorker){
  process.title = 'OOSE: worker'
  var worker = require('./worker')
  worker.start()
}
