'use strict';
var P = require('bluebird')
var infant = require('infant')

var cluster
var config = require('../config')
var cradle = require('../helpers/couchdb')

var prismKey = cradle.schema.store(config.prism.name)

//make some promises
P.promisifyAll(infant)

if(require.main === module){
  infant.child(
    'oose:' + config.prism.name + ':master',
    function(done){
      console.log('Beginning prism startup')
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
          //now register ourselves or mark ourselves available
          return cradle.db.getAsync(prismKey)
        })
        .then(
          //if we exist lets mark ourselves available
          function(doc){
            doc.available = true
            return cradle.db.saveAsync(prismKey,doc._rev,doc)
          },
          //if we dont exist lets make sure thats why and create ourselves
          function(err){
            if(404 !== err.headers.status) throw err
            return cradle.db.saveAsync(prismKey,{
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
          console.log('Prism startup complete')
          done()
        })
        .catch(function(err){
          console.log(err.stack)
          console.log(err)
          done(err)
        })
    },
    function(done){
      //mark ourselves as down
      cradle.db.getAsync(prismKey)
        .then(function(doc){
          doc.available = false
          return cradle.db.saveAsync(prismKey,doc._rev,doc)
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
