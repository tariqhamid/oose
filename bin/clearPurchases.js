'use strict';
var debug = require('debug')('oose:clearPurchases')
var infant = require('infant')
var ProgressBar = require('progress')

//var config = require('../config')
var cradle = require('../helpers/couchdb')

var progress


/**
 * Run the interval
 * @param {function} done
 */
var runInterval = function(done){
  console.log('Starting to clear purchases')
  //first lets get all the purchases
  var purchaseKey = cradle.schema.purchase()
  var purchases = []
  debug('requesting purchases',purchaseKey)
  cradle.db.allAsync({
    startkey: purchaseKey,
    endkey: purchaseKey + '\uffff'
  })
    .then(function(result){
      debug('purchase result; purchases: ',result.length)
      progress = new ProgressBar(
        '  purging [:bar] :current/:total :percent :rate/pps :etas',
        {
          total: result.length,
          width: 50,
          complete: '=',
          incomplete: '-'
        }
      )
      debug('getting purchase information')
      //now we have to get all the documents and consume even more memory
      return cradle.db.getAsync(result)
    })
    .then(function(result){
      debug('purchase information received: ', result.length)
      //now the result we have is the official list of documents
      //this gives us the purchase keys and to my understanding we just have
      //to update these to deleted now
      result.forEach(function(purchase){
        purchases.push({
          _id: purchase._id,
          _rev: purchase._rev,
          _deleted: true
        })
      })
      debug('saving deletion of purchases',purchases[0],purchases.length)
      //now we just use cradle to save the purchases
      cradle.db.saveAsync(purchases)
    })
    .then(function(){
      debug('purchase deletion complete')
      done()
    })
    .catch(function(err){
      console.log(err.stack)
      done(err)
    })
    .finally(function(){
      console.log('Purchase clearing complete')
      process.exit()
    })
}

if(require.main === module){
  infant.child(
    'oose:clearPurchases',
    function(done){
      //setup the interval for collection from master
      runInterval(done)
    },
    function(done){
      process.nextTick(done)
    }
  )
}

