'use strict';
var P = require('bluebird')
var infant = require('infant')

var sequelize = require('./../helpers/sequelize')()

var cluster
var votePrune
var config = require('../config')

//make some promises
P.promisifyAll(infant)

if(require.main === module){
  votePrune = infant.parent('./votePrune')
  infant.child(
    'oose:' + config.master.name + ':master',
    function(done){
      sequelize.doConnect()
        .then(function(){
          return votePrune.startAsync()
        })
        .then(function(){
          cluster = infant.cluster(
            './worker',
            {
              enhanced: true,
              count: config.master.workers.count,
              maxConnections: config.master.workers.maxConnections
            }
          )
          return cluster.startAsync()
        })
        .then(function(){
          done()
        })
        .catch(function(err){
          done(err.message || err)
        })
    },
    function(done){
      if(!cluster) return done()
      votePrune.stopAsync()
        .then(function(){
          return cluster.stopAsync()
        })
        .then(function(){
          done()
        })
        .catch(function(err){
          done(err.message || err)
        })
    }
  )
}
