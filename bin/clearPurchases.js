'use strict';
var debug = require('debug')('oose:clearPurchases')
var infant = require('infant')

//var config = require('../config')
var cradle = require('../helpers/couchdb')


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
      //this gives us the purchase keys and to my understanding we just have
      //to update these to deleted now
      var purchase = {}
      for(var i = 0; i < result.length; i++){
        purchase = result[i]
        console.log(purchase)
        purchases.push({
          _id: purchase.id,
          _rev: purchase.value.rev,
          _deleted: true
        })
      }
      debug('saving deletion of purchases',purchases[0],purchases.length)
      //now we just use cradle to save the purchases
      cradle.db.saveAsync(purchases)
    })
    .then(function(result){
      console.log(result)
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

