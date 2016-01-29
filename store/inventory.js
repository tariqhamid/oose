'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:store:inventory')
var fs = require('graceful-fs')
var infant = require('infant')
var os = require('os')
var prettyBytes = require('pretty-bytes')
var random = require('random-js')()

var config = require('../config')

var interval

//make some promises
P.promisifyAll(fs)

//determine inventory driver
var scanInventory
if(os.platform().match(/(darwin|linux|freebsd|sunos)/i)){
  //this is the high performance unix driver that uses find
  scanInventory = require('./inventory/unix.js')
} else {
  //the native drive will work everywhere and is perfect for small to mid
  //size installations and development
  scanInventory = require('./inventory/native.js')
}

//make the function a promise
var scanInventoryAsync = P.promisify(scanInventory)


/**
 * Run the inventory scan
 */
var runInterval = function(){
  console.log('Starting to examine store inventory')
  var scanStart = +new Date()
  var scanEnd = scanStart + 1000
  var duration = 0
  scanInventoryAsync()
    .then(function(counter){
      scanEnd = +new Date()
      duration = ((scanEnd - scanStart) / 1000).toFixed(2)
      console.log('Inventory scan complete in ' + duration + ' seconds')
      console.log('  ' +
        counter.valid + ' valid ' +
        prettyBytes(counter.bytes) + ' ' +
        counter.created + ' created ' +
        counter.updated + ' updated ' +
        counter.repaired + ' repaired ' +
        counter.invalid + ' invalid ' +
        counter.warning + ' warnings ' +
        counter.error + ' errors'
      )
    })
    .catch(function(err){
      console.log(err.stack)
      console.log('Inventory Scan Error: ' + err.message)
    })
    .finally(function(){
      //register the next run semi randomly to try and percolate the inventory
      //scans to run apart from each other to stop the mini dos on g322
      var timeToNextRun = (duration * random.integer(1,50)) * 1000
      setTimeout(runInterval,timeToNextRun)
    })
}

if(require.main === module){
  infant.child(
    'oose:' + config.store.name + ':inventory',
    function(done){
      //setup the interval for collection from master
      debug('set inventory interval')
      //do initial scan at startup
      //var startupDelay = (1000 * random.integer(300,3600))
      //debug('setting timeout initial inventory scan for ' +
      //  (startupDelay / 1000))
      //setTimeout(runInterval,startupDelay)
      runInterval()
      //return now as we do not want to wait on the first scan it can be
      //lengthy
      process.nextTick(done)
    },
    function(done){
      clearInterval(interval)
      debug('cleared inventory interval')
      process.nextTick(done)
    }
  )
}

