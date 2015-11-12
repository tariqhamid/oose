'use strict';
var P = require('bluebird')
var infant = require('infant')

var config = require('../config')
var cradle = require('../helpers/couchdb')

var cluster
var inventory
var purchase
var storeKey = cradle.schema.store(config.store.name)

//make some promises
P.promisifyAll(infant)

if(require.main === module){
  infant.child(
    'oose:' + config.store.name + ':master',
    function(done){
      console.log('Beginning store startup')
      //bootstrap to start
      cluster = infant.cluster(
        './worker',
        {
          enhanced: true,
          count: config.store.workers.count,
          maxConnections: config.store.workers.maxConnections
        }
      )
      inventory = infant.parent('./inventory')
      purchase = infant.parent('./purchase')
      //fire everything up
      P.all([
        cluster.startAsync(),
        inventory.startAsync(),
        purchase.startAsync()
      ])
        .then(function(){
          //now register ourselves or mark ourselves available
          return cradle.db.getAsync(storeKey)
        })
        .then(
          //if we exist lets mark ourselves available
          function(doc){
            doc.available = true
            return cradle.db.saveAsync(storeKey,doc._rev,doc)
          },
          //if we dont exist lets make sure thats why and create ourselves
          function(err){
            if(404 !== err.headers.status) throw err
            return cradle.db.saveAsync(storeKey,{
              name: config.store.name,
              host: config.store.host,
              port: config.store.port,
              writable: true,
              available: true,
              active: true,
              createdAt: new Date().toJSON()
            })
          }
        )
        .then(function(){
          console.log('Store startup complete')
        })
        .catch(function(err){
          console.log(err.stack)
          console.log(err)
          done(err)
        })
    },
    function(done){
      //mark ourselves as down
      cradle.db.getAsync(storeKey)
        .then(function(doc){
          doc.available = false
          return cradle.db.saveAsync(storeKey,doc._rev,doc)
        })
        .then(function(){
          if(!cluster) return
          return cluster.stopAsync()
        })
        .then(function(){
          done()
        })
        .catch(function(err){
          console.log(err.stack)
          console.log(err)
          done(err)
        })
    }
  )
}
