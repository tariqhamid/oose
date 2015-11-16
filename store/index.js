'use strict';
var P = require('bluebird')
var fs = require('graceful-fs')
var infant = require('infant')
var mkdirp = require('mkdirp-then')
var path = require('path')

var config = require('../config')
var cradle = require('../helpers/couchdb')

var cluster
var inventory
var purchase
var storeKey = cradle.schema.store(config.prism.name,config.store.name)

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
      //check if our needed folders exist
      P.try(function(){
        var promises = []
        var rootFolder = path.resolve(config.root)
        var contentFolder = path.resolve(rootFolder + '/content')
        var purchaseFolder = path.resolve(rootFolder + '/purchased')
        if(!fs.existsSync(contentFolder))
          promises.push(mkdirp(contentFolder))
        if(!fs.existsSync(purchaseFolder))
          promises.push(mkdirp(purchaseFolder))
        return P.all(promises)
      })
        .then(function(){
          //fire everything up
          return P.all([
            cluster.startAsync(),
            inventory.startAsync(),
            purchase.startAsync()
          ])
        })
        .then(function(){
          //now register ourselves or mark ourselves available
          return cradle.db.getAsync(storeKey)
        })
        .then(
          //if we exist lets mark ourselves available
          function(doc){
            doc.prism = config.store.prism
            doc.name = config.store.name
            doc.host = config.store.host
            doc.port = config.store.port
            doc.available = true
            doc.active = true
            return cradle.db.saveAsync(storeKey,doc)
          },
          //if we dont exist lets make sure thats why and create ourselves
          function(err){
            if(404 !== err.headers.status) throw err
            return cradle.db.saveAsync(storeKey,{
              prism: config.store.prism,
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
          //start the heartbeat service
          if(config.heartbeat.enabled){
            require('../helpers/heartbeat')
              .getInstance('store',config.store.name,config.store.port)
          }
          console.log('Store startup complete')
          done()
        })
        .catch(function(err){
          console.log(err.stack)
          console.log(err)
          done(err)
        })
    },
    function(done){
      console.log('Beginning store shutdown')
      //mark ourselves as down
      cradle.db.getAsync(storeKey)
        .then(function(doc){
          doc.available = false
          return cradle.db.saveAsync(storeKey,doc)
        })
        .then(function(){
          if(!cluster) return
          return cluster.stopAsync()
        })
        .then(function(){
          console.log('Store shutdown complete')
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
