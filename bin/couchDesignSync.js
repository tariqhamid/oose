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
  cradle.inventory.saveAsync('_design/inventory',{
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
    }
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

