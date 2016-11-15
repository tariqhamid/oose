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
  console.log('Starting to clear purchases from inventory')
  //first lets get all the purchases
  var purchases = []
  debug('requesting purchases')
  cradle.inventory.viewAsync('purchase/purchase')
    .then(function(result){
      debug('purchase result; purchases: ',result.length)
      //this gives us the purchase keys and to my understanding we just have
      //to update these to deleted now
      var purchase = {}
      for(var i = 0; i < result.length; i++){
        purchase = result[i]
        purchases.push({
          _id: purchase.id,
          _rev: purchase.value._rev,
          _deleted: true
        })
      }
      debug('saving deletion of purchases',purchases.length,purchases[0])
      //now we just use cradle to save the purchases
      return cradle.inventory.saveAsync(purchases)
    })
    .then(function(result){
      var deleted = 0
      result.forEach(function(row){
        if(row.ok) deleted++
      })
      console.log('Deletion complete, ' + deleted + ' records removed')
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

