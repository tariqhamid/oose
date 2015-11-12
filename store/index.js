'use strict';
var P = require('bluebird')
var infant = require('infant')

var cluster
var inventory
var purchase
var config = require('../config')

if(require.main === module){
  infant.child(
    'oose:' + config.store.name + ':master',
    function(done){
      cluster = P.promisifyAll(infant.clusterSetup(
        './worker',
        {
          enhanced: true,
          count: config.store.workers.count,
          maxConnections: config.store.workers.maxConnections
        }
      ))
      inventory = P.promisifyAll(infant.child('./inventory'))
      purchase = P.promisifyAll(infant.child('./purchase'))
      P.all([
        cluster.startAsync(),
        inventory.startAsync(),
        purchase.startAsync()
      ])
        .then(function(){
          done()
        })
        .catch(function(err){
          console.log(err.stack)
          console.log(err)
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
