'use strict';
var cluster = require('cluster')

//master startup
if(cluster.isMaster) require('./master').start()

//worker startup
if(cluster.isWorker) require('./worker').start()
