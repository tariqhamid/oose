'use strict';
var P = require('bluebird')
var fs = require('graceful-fs')
var infant = require('infant')

var config = require('../config')
var cradle = require('../helpers/couchdb')

//make some promises
P.promisifyAll(fs)


/**
 * Emit will be executed in the context of couchdb not here this is just a dummy
 */
var emit = function(){}


/**
 * Run the interval
 * @param {function} done
 */
var runInterval = function(done){
  console.log('Starting create couch designs')
  cradle.db.saveAsync('_design/inventory',{
    byStore: {
      map: function(doc){
        emit([doc.store],doc)
      }
    },
    byPrism: {
      map: function(doc){
        emit([doc.prism],doc)
      }
    },
    byHash: {
      map: function(doc){
        emit([doc.hash],doc)
      }
    },
    byMimeType: {
      map: function(doc){
        emit([doc.mimeType],doc)
      }
    },
    byMimeExtension: {
      map: function(doc){
        emit([doc.mimeExtension],doc)
      }
    }
  })
    .then(function(){
      return cradle.db.saveAsync('_design/purchase',{
        byExpirationDate: {
          map: function(doc){
            emit([doc.expirationDate],doc)
          }
        },
        byExt: {
          map: function(doc){
            emit([doc.ext],doc)
          }
        },
        byHash: {
          map: function(doc){
            emit([doc.hash],doc)
          }
        },
        byHashType: {
          map: function(doc){
            emit([doc.hashType],doc)
          }
        },
        byIP: {
          map: function(doc){
            emit([doc.ip],doc)
          }
        },
        byLife: {
          map: function(doc){
            emit([doc.life],doc)
          }
        },
        bySessionToken: {
          map: function(doc){
            emit([doc.sessionToken],doc)
          }
        },
        byToken: {
          map: function(doc){
            emit([doc.token],doc)
          }
        }
      })
    })
    .then(function(){
      done()
    })
    .catch(function(err){
      done(err)
    })
}

if(require.main === module){
  infant.child(
    'oose:' + config.store.name + ':couchDesignSync',
    function(done){
      //setup the interval for collection from master
      runInterval(done)
    },
    function(done){
      process.nextTick(done)
    }
  )
}

