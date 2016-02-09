'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:prismBalance')

var cradle = require('../helpers/couchdb')
var redis = require('../helpers/redis')


/**
 * Get list of prisms and cache the result
 * @return {P}
 */
exports.peerList = function(){
  redis.incr(redis.schema.counter('prism','prismBalance:peerList'))
  var prismKey = cradle.schema.prism()
  var storeKey = cradle.schema.store()
  return P.all([
    function(){
      return cradle.db.allAsync({
          startkey: prismKey,
          endkey: prismKey + '\uffff'
        })
        .then(function(rows){
          var ids = []
          for(var i=0; i < rows.length;i++) ids.push(rows[i].id)
          return cradle.db.getAsync(ids)
        })
        .map(function(row){
          row.doc.type = 'prism'
          return row.doc
        })
    },
    function(){
      return cradle.db.allAsync({
        startkey: storeKey,
        endkey: storeKey + '\uffff'
      })
        .then(function(rows){
          var ids = []
          for(var i=0; i < rows.length;i++) ids.push(rows[i].id)
          return cradle.db.getAsync(ids)
        })
        .map(function(row){
          row.doc.type = 'store'
          return row.doc
        })
    }
  ])
    .then(function(result){
      var peers = []
      peers = result[0].concat(peers)
      peers = result[1].concat(peers)
      return peers
    })
}


/**
 * Get list of prisms and cache the result
 * @return {P}
 */
exports.prismList = function(){
  redis.incr(redis.schema.counter('prism','prismBalance:prismList'))
  var prismKey = cradle.schema.prism()
  return cradle.db.allAsync({startkey: prismKey, endkey: prismKey + '\uffff'})
    .then(function(rows){
      var ids = []
      for(var i=0; i < rows.length;i++) ids.push(rows[i].id)
      return cradle.db.getAsync(ids)
    })
    .map(function(row){
      return row.doc
    }).filter(function(doc){
      return doc.name && doc.available && doc.active
    })
}


/**
 * Store list by prism
 * @param {string} prism
 * @return {P}
 */
exports.storeListByPrism = function(prism){
  redis.incr(redis.schema.counter('prism','prismBalance:storeListByPrism'))
  var storeKey = cradle.schema.store(prism)
  return cradle.db.all({startkey: storeKey, endkey: storeKey + '\uffff'})
    .map(function(row){
      return cradle.db.getAsync(row.key)
    })
    .filter(function(row){
      return row.available && row.active
    })
}


/**
 * Populate hits from a token
 * @param {string} token
 * @param {Array} prismList
 * @return {Array}
 */
exports.populateHits = function(token,prismList){
  redis.incr(redis.schema.counter('prism','prismBalance:populateHits'))
  var populate = function(prism){
    return function(hits){
      prism.hits = +hits
    }
  }
  var promises = []
  var prism
  for(var i = 0; i < prismList.length; i++){
    prism = prismList[i]
    promises.push(
      redis.getAsync(redis.schema.prismHits(token,prism.name))
        .then(populate(prism))
    )
  }
  return P.all(promises)
    .then(function(){
      return prismList
    })
}


/**
 * Pick a winner from a prism list
 * @param {string} token
 * @param {Array} prismList
 * @param {Array} skip
 * @param {boolean} allowFull
 * @return {P}
 */
exports.winner = function(token,prismList,skip,allowFull){
  if(undefined === allowFull) allowFull = false
  redis.incr(redis.schema.counter('prism','prismBalance:winner'))
  if(!(skip instanceof Array)) skip = []
  if(!(prismList instanceof Array)) prismList = []
  var winner = false
  return exports.populateHits(token,prismList)
    .then(function(prismList){
      var prism
      for(var i = 0; i < prismList.length; i++){
        prism = prismList[i]
        if((-1 === skip.indexOf(prism.name)) && (allowFull || prism.writable) &&
          ((!winner) || (winner.hits > prism.hits))) winner = prism
      }
      return redis.incrAsync(redis.schema.prismHits(token,winner.name))
    })
    .then(function(){
      return winner
    })
}


/**
 * Check existence of a hash (cached)
 * @param {string} hash
 * @return {P}
 */
exports.contentExists = function(hash){
  redis.incr(redis.schema.counter('prism','prismBalance:contentExists'))
  var existsKey = cradle.schema.inventory(hash)
  var count = 0
  debug(existsKey,'contentExists received')
  var deadRecord = {
    hash: hash,
    mimeType: null,
    mimeExtension: null,
    relativePath: null,
    exists: false,
    count: 0,
    map: []
  }
  return cradle.db.allAsync({startkey: existsKey, endkey: existsKey + '\uffff'})
    .map(
      function(row){
        debug(existsKey,'got record',row)
        count++
        return cradle.db.getAsync(row.key)
      },
      function(err){
        if(404 !== err.headers.status) throw err
        count = 0
      }
    )
    .then(function(inventoryList){
      //debug(existsKey,'records',result)
      if(!count){
        return deadRecord
      } else {
        return P.try(function(){
          return inventoryList
        })
          .map(function(row){
            debug(existsKey,'got inventory list record',row)
            return P.all([
              cradle.db.getAsync(cradle.schema.prism(row.prism)),
              cradle.db.getAsync(cradle.schema.store(row.prism,row.store))
            ])
          })
          .filter(function(row){
            return !!row[0].available && !!row[1].available
          })
          .then(function(result){
            var map = result.map(function(val){
              return val[0].name + ':' + val[1].name
            })
            var record = {
              hash: inventoryList[0].hash,
              mimeType: inventoryList[0].mimeType,
              mimeExtension: inventoryList[0].mimeExtension,
              relativePath: inventoryList[0].relativePath,
              count: map.length,
              exists: true,
              map: map
            }
            debug(existsKey,'inventory record',record)
            return record
          })
      }
    })
    .catch(function(err){
      console.log('EXISTS ERROR: ' + err.message,hash)
      return deadRecord
    })
}
