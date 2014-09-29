'use strict';
var child = require('infant').child
var clusterSetup = require('infant').cluster

var cluster
var config = require('../config')

if(require.main === module){
  child(
    'oose:gump:master',
    function(done){
      cluster = clusterSetup(
        './worker',
        {
          enhanced: true,
          count: config.gump.workers
        }
      )
      cluster.start(function(err){
        done(err)
      })
    },
    function(done){
      if(!cluster) return done()
      cluster.stop(function(err){
        done(err)
      })
    }
  )
}
