'use strict';
var cluster = require('cluster')

var child = require('./helpers/child').child

if(require.main === module){
  if(cluster.isMaster){
    var master = require('./master')
    child(
      'oose:master',
      function(done){
        master.start(done)
      },
      function(done){
        master.stop(done)
      }
    )
  } else {
    var worker = require('./worker')
    child(
      'oose:worker',
      function(done){
        worker.start(done)
      },
      function(done){
        worker.stop(done)
      }
    )
  }
}
