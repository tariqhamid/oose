'use strict';
var child = require('infant').child
var clusterSetup = require('infant').cluster

var sequelize = require('./../helpers/sequelize')()

var cluster
var config = require('../config')

if(require.main === module){
  child(
    'oose:' + config.master.name + ':master',
    function(done){
      sequelize.doConnect()
        .then(function(){
          cluster = clusterSetup(
            './worker',
            {
              enhanced: true,
              count: config.master.workers.count,
              maxConnections: config.master.workers.maxConnections
            }
          )
          cluster.start(function(err){
            done(err)
          })
        })
        .catch(function(err){
          done(err.message || err)
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
