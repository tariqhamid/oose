'use strict';
var P = require('bluebird')
var infant = require('infant')

var cluster
var config = require('../config')

//make some promises
P.promisifyAll(infant)

if(require.main === module){
  infant.child(
    'oose:' + config.prism.name + ':master',
    function(done){
      cluster = infant.cluster(
        './worker',
        {
          enhanced: true,
          count: config.prism.workers.count,
          maxConnections: config.prism.workers.maxConnections
        }
      )
      cluster.startAsync()
       .then(function(){
          done()
        })
        .catch(done)
    },
    function(done){
      cluster.stopAsync()
        .then(function(){
          return guard.stopAsync()
        })
        .then(function(){
          done()
        })
        .catch(done)
    }
  )
}
