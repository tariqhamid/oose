'use strict';
var P = require('bluebird')
var infant = require('infant')

var config = require('../config')
var cradle = require('../helpers/couchdb')

var cluster
var heartbeat
var prismKey = cradle.schema.prism(config.prism.name)

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
      heartbeat = infant.parent('../helpers/heartbeat')
      P.all([
        cluster.startAsync(),
        heartbeat.startAsync()
      ])
        .then(function(){
          //now register ourselves or mark ourselves available
          return cradle.db.getAsync(prismKey)
        })
        .then(
          //if we exist lets mark ourselves available
          function(doc){
            doc.name = config.prism.name
            doc.host = config.prism.host
            doc.port = config.prism.port
            doc.available = true
            doc.active = true
            return cradle.db.saveAsync(prismKey,doc)
          },
          //if we dont exist lets make sure thats why and create ourselves
          function(err){
            if(404 !== err.headers.status) throw err
            return cradle.db.saveAsync(prismKey,{
              name: config.prism.name,
              host: config.prism.host,
              port: config.prism.port,
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
      console.log('Beginning prism shutdown')
      //mark ourselves as down
      cradle.db.getAsync(prismKey)
        .then(function(doc){
          doc.available = false
          return cradle.db.saveAsync(prismKey,doc)
        })
        .then(function(){
          if(!cluster) return
          return P.all([
            cluster.stopAsync(),
            heartbeat.stopAsync()
          ])
        })
        .then(function(){
          console.log('Prism shutdown complete')
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
