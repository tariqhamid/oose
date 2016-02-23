'use strict';
var debug = require('debug')('oose:clearPurchases')
var infant = require('infant')
var ProgressBar = require('progress')

//var config = require('../config')
var cradle = require('../helpers/couchdb')


/**
 * Setup migration concurrency
 * @type {{store: number, prism: number, inventory: number, purchase: number}}
 */
var concurrency = {
  store: 4,
  prism: 4,
  inventory: 32,
  purchase: 64
}


/**
 * Stat counter
 * @type {{moved: number, warning: number, error: number}}
 */
var counter = {
  moved: 0,
  exists: 0,
  warning: 0,
  error: 0
}


/**
 * Migrate Store Peers
 * @return {P}
 */
var migrateStores = function(){
  var storeKey = 'oose:store:'
  var count = {}
  var progress
  debug('requesting stores',storeKey)
  return cradle.oose.allAsync({
    startkey: storeKey,
    endkey: storeKey + '\uffff'
  })
    .then(function(result){
      count.store = result.length
      debug('store result; records: ',count.store)
      //this gives us the inventory keys and now we must select all the docs
      //and place them into the new database, so we will setup a progress bar
      progress = new ProgressBar(
        '  peer:store [:bar] :current/:total :percent :rate/rps :etas',
        {
          total: count.store,
          width: 50,
          complete: '=',
          incomplete: '-'
        }
      )
      return result
    })
    .map(function(row){
      return cradle.oose.getAsync(row.id)
        .then(function(record){
          //we need the new row
          var newKey = cradle.schema.store(record.prism,record.store)
          record._id = newKey
          delete record._rev
          return cradle.peer.saveAsync(newKey,record)
        })
        .then(
          function(){
            counter.moved++
          },
          function(err){
            if(err.message.match(/conflict/i)) counter.exists++
            else throw err
          }
        )
        .catch(function(err){
          console.log(err.stack)
          counter.error++
        })
        .finally(function(){
          progress.tick()
        })
    },{concurrency: concurrency.store})
}


/**
 * Migrate Prism Peers
 * @return {P}
 */
var migratePrisms = function(){
  var prismKey = 'oose:prism:'
  var count = {}
  var progress
  debug('requesting prisms',prismKey)
  return cradle.oose.allAsync({
      startkey: prismKey,
      endkey: prismKey + '\uffff'
    })
    .then(function(result){
      count.prism = result.length
      debug('prism result; records: ',count.prism)
      //this gives us the inventory keys and now we must select all the docs
      //and place them into the new database, so we will setup a progress bar
      progress = new ProgressBar(
        '  peer:prism [:bar] :current/:total :percent :rate/rps :etas',
        {
          total: count.prism,
          width: 50,
          complete: '=',
          incomplete: '-'
        }
      )
      return result
    })
    .map(function(row){
      return cradle.oose.getAsync(row.id)
        .then(function(record){
          //we need the new row
          var newKey = cradle.schema.store(record.name)
          record._id = newKey
          delete record._rev
          return cradle.peer.saveAsync(newKey,record)
        })
        .then(
          function(){
            counter.moved++
          },
          function(err){
            if(err.message.match(/conflict/i)) counter.exists++
            else throw err
          }
        )
        .catch(function(err){
          console.log(err.stack)
          counter.error++
        })
        .finally(function(){
          progress.tick()
        })
    },{concurrency: concurrency.prism})
}


/**
 * Migrate inventory records
 * @return {P}
 */
var migrateInventory = function(){
  console.log('Starting to migrate inventory')
  var inventoryKey = 'oose:inventory:'
  var count = {}
  var progress
  debug('requesting inventory',inventoryKey)
  return cradle.oose.allAsync({
      startkey: inventoryKey,
      endkey: inventoryKey + '\uffff'
    })
    .then(function(result){
      count.inventory = result.length
      debug('inventory result; records: ',count.inventory)
      //this gives us the inventory keys and now we must select all the docs
      //and place them into the new database, so we will setup a progress bar
      progress = new ProgressBar(
        '  inventory [:bar] :current/:total :percent :rate/rps :etas',
        {
          total: count.inventory,
          width: 50,
          complete: '=',
          incomplete: '-'
        }
      )
      return result
    })
    .map(function(row){
      return cradle.oose.getAsync(row.key)
        .then(function(record){
          //we need the new row
          var newKey = cradle.schema.inventory(
            record.hash,
            record.prism,
            record.store
          )
          record._id = newKey
          delete record._rev
          return cradle.inventory.saveAsync(newKey,record)
        })
        .then(
          function(){
            counter.moved++
          },
          function(err){
            if(err.message.match(/conflict/i)) counter.exists++
            else throw err
          }
        )
        .catch(function(err){
          console.log(err.stack)
          counter.error++
        })
        .finally(function(){
          progress.tick()
        })
    },{concurrency: concurrency.inventory})
}


/**
 * Migrate purchase records
 * @return {P}
 */
var migratePurchases = function(){
  console.log('Starting to migrate purchases')
  var purchaseKey = 'oose:purchase:'
  var count = {}
  var progress
  debug('requesting inventory',purchaseKey)
  return cradle.oose.allAsync({
      startkey: purchaseKey,
      endkey: purchaseKey + '\uffff'
    })
    .then(function(result){
      count.purchase = result.length
      debug('purchase result; records: ',count.purchase)
      //this gives us the inventory keys and now we must select all the docs
      //and place them into the new database, so we will setup a progress bar
      progress = new ProgressBar(
        '  purchases [:bar] :current/:total :percent :rate/rps :etas',
        {
          total: count.purchase,
          width: 50,
          complete: '=',
          incomplete: '-'
        }
      )
      return result
    })
    .map(function(row){
      return cradle.oose.getAsync(row.key)
        .then(function(record){
          //we need the new row
          var newKey = cradle.schema.purchase(record.token)
          record._id = newKey
          delete record._rev
          return cradle.purchase.saveAsync(newKey,record)
        })
        .then(
          function(){
            counter.moved++
          },
          function(err){
            if(err.message.match(/conflict/i)) counter.exists++
            else throw err
          }
        )
        .catch(function(err){
          console.log(err.stack)
          counter.error++
        })
        .finally(function(){
          progress.tick()
        })
    },{concurrency: concurrency.purchase})
}


/**
 * Run the interval
 * @param {function} done
 */
var runInterval = function(done){
  //first lets get all the purchases
  migrateStores()
    .then(function(){
      return migratePrisms()
    })
    .then(function(){
      return migrateInventory()
    })
    .then(function(){
      return migratePurchases()
    })
    .then(function(){
      console.log(
        'Migration complete, ' +
        counter.moved + ' moved ' +
        counter.exists + ' already exist ' +
        counter.warning + ' warn ' +
        counter.error + ' error '
      )
      done()
    })
    .catch(function(err){
      console.log(err.stack)
      done(err)
    })
    .finally(function(){
      console.log('CouchDB Migration complete')
      process.exit()
    })
}

if(require.main === module){
  infant.child(
    'oose:couchMigrator',
    function(done){
      runInterval(done)
    },
    function(done){
      process.nextTick(done)
    }
  )
}

