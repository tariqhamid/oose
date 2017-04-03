'use strict';
var P = require('bluebird')
var debug = require('debug')('helper:fileOp')
var ObjectManage = require('object-manage')
var oose = require('oose-sdk')
var random = require('random-js')()
var prettyBytes = require('pretty-bytes')

var config = require('../config')

var couchdb = require('../helpers/couchdb')
var redis = require('../helpers/redis')()

const fileActions = {
  'nop': 0,
  'stat': 1,
  'copy': 2,
  'verify': 3,
  'unlink': 4
}

var fileOp = function(file,peerList){
  fileOp.file = file
  //store our snapshot of a peerList
  fileOp.peerList = peerList || {}
  //populate properties
  fileOp.fileActions = fileActions
  fileOp.action = fileActions.nop
  fileOp.source = ''
  fileOp.destination = ''
  return fileOp
}

fileOp.selectPeer = function(type,peerName){
  if(!type) type = 'store'
  var result = {}
  fileOp.peerList.forEach(function(peer){
    if(peer.type !== type || peer.name !== peerName) return
    result = peer
  })
  return result
}

fileOp.setupStore = function(store){
  var opts = new ObjectManage()
  opts.$load(config.store)
  opts.$load(store)
  opts = opts.$strip()
  return oose.api.store(opts)
}

fileOp.addClones = function(file){
  var promises = []
  var storeWinnerList = []
  var addClone = function(file){
    // so to create a clone we need to figure out a source store
    var startStamp = +new Date()
    var prismFromWinner
    var storeFromWinner
    var prismToWinner
    var storeToWinner
    var storeFromList =[]
    var storeToList = []
    //iteration vars
    var prismNameList = []
    var storeNameList = []
    file.map.forEach(function(entry){
      var parts = entry.split(':')
      var prismName = parts[0]
      var storeName = parts[1]
      prismNameList.push(prismName)
      storeNameList.push(storeName)
      storeFromList.push({prism: prismName, store: storeName})
    })
    // randomly select one source store
    storeFromWinner = storeFromList[
      random.integer(0,(storeFromList.length - 1))]
    prismFromWinner = storeFromWinner.prism
    // figure out a destination store
    fileOp.peerList.forEach(function(peer){
      //skip prisms and whatever else
      if('store' !== peer.type) return
      if(
        peer.prism !== prismFromWinner &&
        -1 === storeWinnerList.indexOf(peer.name) &&
        -1 === file.map.indexOf(peer.prism + ':' + peer.name) &&
        true === peer.available &&
        true === peer.writable
      ){
        storeToList.push({prism: peer.prism, store: peer.name})
      }
    })
    //make sure there is a possibility of a winner
    if(!storeToList.length){
      console.error(file.hash,
        'Sorry! No more available stores to send this to :(')
    } else {
      //figure out a dest winner
      storeToWinner = storeToList[
        random.integer(0,(storeToList.length - 1))]
      storeWinnerList.push(storeToWinner.store)
      prismToWinner = storeToWinner.prism
      //inform of our decision
      console.log(file.hash,
        'Sending from ' + storeFromWinner.store +
        ' on prism ' + prismFromWinner +
        ' to ' + storeToWinner.store + ' on prism ' + prismToWinner)
      var storeFromInfo = fileOp.selectPeer('store',storeFromWinner.store)
      var sendClient = fileOp.setupStore(storeFromInfo)
      var sendOptions = {
        file: file.hash + '.' + file.mimeExtension.replace('.',''),
        store: storeToWinner.prism + ':' + storeToWinner.store
      }
      return sendClient.postAsync({
        url: sendClient.url('/content/send'),
        json: sendOptions
      })
        .spread(function(res,body){
          if(body.error){
            var err = new Error(body.error)
            err.stack = body.stack
            throw err
          } else {
            var endStamp = +new Date()
            var fileSize = 1024
            if(body && body.fileDetail &&
              body.fileDetail.stat && body.fileDetail.stat.size){
              fileSize = body.fileDetail.stat.size
            }
            var duration = (endStamp - startStamp) / 1000
            var rate = (((fileSize) / duration) / 1024).toFixed(2)
            console.log(file.hash,
              'Sent ' + prettyBytes(fileSize) + ' to ' + storeToWinner.store +
              ' taking ' + duration +
              ' seconds averaging ' + rate + '/KBs, success!')
          }
        })
        .catch(function(err){
          console.error(file.hash,
            'Failed to send clone to ' + storeToWinner.store,err.message)
        })
        .finally(function(){
          var existsKey = couchdb.schema.inventory(file.hash)
          redis.del(existsKey)
        })
    }
  }
  for(var i = 0; i < file.add; i++){
    promises.push(addClone(file))
  }
  return P.all(promises)
}

fileOp.removeClones = function(file){
  var promises = []
  var storeWinnerList = []
  var removeClone = function(file){
    // so to create a clone we need to figure out a source store
    var storeRemoveWinner
    var storeRemoveList = []
    //iteration vars
    var prismNameList = []
    var storeNameList = []
    file.map.forEach(function(entry){
      var parts = entry.split(':')
      var prismName = parts[0]
      var storeName = parts[1]
      if(-1 === config.clonetool.storeProtected.indexOf(storeName)){
        var peer = fileOp.selectPeer('store',storeName)
        prismNameList.push(prismName)
        storeNameList.push(storeName)
        if((true === peer.available) &&
          (-1 === storeWinnerList.indexOf(storeName))
        ){
          storeRemoveList.push({prism: prismName,store: storeName})
        }
      }
    })
    //make sure there is a possibility of a winner
    if(!storeRemoveList.length){
      console.error(file.hash,
        'Sorry! No more available stores to remove this from, it is gone. :(')
    } else {
      // now we know possible source stores, randomly select one
      storeRemoveWinner = storeRemoveList[
        random.integer(0,(storeRemoveList.length - 1))]
      storeWinnerList.push(storeRemoveWinner.store)
      //inform of our decision
      console.log(file.hash,
        'Removing from ' + storeRemoveWinner.store +
        ' on prism ' + storeRemoveWinner.prism)
      var selectedStoreInfo = fileOp.selectPeer('store',storeRemoveWinner.store)
      var storeClient = fileOp.setupStore(selectedStoreInfo)
      return storeClient.postAsync({
        url: storeClient.url('/content/remove'),
        json: {
          hash: file.hash
        }
      })
        .spread(storeClient.validateResponse())
        .catch(function(err){
          console.error(file.hash,'Failed to remove clone',err.message)
        })
        .finally(function(){
          var existsKey = couchdb.schema.inventory(file.hash)
          redis.del(existsKey)
        })
    }
  }
  for(var i = 0; i < file.remove; i++){
    promises.push(removeClone(file))
  }
  return P.all(promises)
}

fileOp.verifyFile = function(file){
  //first grab a store to ask for info
  if(!file.count || !file.exists || !(file.map instanceof Array)){
    console.error(file.hash,'Doesn\'t exist, can\'t verify')
    return
  }
  return P.try(function(){
    return file.map
  })
    .map(function(storeKey){
      var keyParts = storeKey.split(':')
      var storeInfo = fileOp.selectPeer('store',keyParts[1])
      var storeClient = fileOp.setupStore(storeInfo)
      return storeClient.postAsync({
        url: storeClient.url('/content/verify'),
        json: {
          file: file.hash + '.' + ('' + file.mimeExtension).replace('.','')
        }
      })
        .spread(function(res,body){
          if(body && body.error){
            console.error(file.hash,'Verify failed ' + body.error +
              ' on ' + keyParts[1] + ' inventory purged')
          } else if(body && 'ok' === body.status){
            console.log(file.hash,
              'Inventory verification complete on ' + keyParts[1])
          } else if(body && 'fail' === body.status){
            console.error(file.hash,
              'Invalid content on ' + keyParts[1] + ' clone removed')
          } else {
            console.error(file.hash,'Unknown issue',body)
          }
        })
        .catch(function(err){
          console.error(file.hash,'Failed to verify inventory',err.message)
        })
        .finally(function(){
          var existsKey = couchdb.schema.inventory(file.hash)
          redis.del(existsKey)
        })
    })
}


/**
 * Export client
 * @param {object} options
 * @return {function} constructor
 */
module.exports = fileOp
