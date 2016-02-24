'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:clearPurchases')
var infant = require('infant')
var jSONStream = require('json-stream')
var ProgressBar = require('progress')

var config = require('../config')
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
  skipped: 0,
  warning: 0,
  error: 0
}


/**
 * Migrate Items
 * @param {string} name
 * @param {string} itemKey
 * @param {string} dbName
 * @param {function} keyFunc
 * @param {function} filterFunc
 * @return {P}
 */
var migrateItems = function(name,itemKey,dbName,keyFunc,filterFunc){
  return new P(function(resolve,reject){
    console.log('Starting to migrate ' + name + ' records')
    var progress
    debug('requesting ' + name,itemKey)
    var writeStream = jSONStream()
    var result = []
    var readStreamOpts = {
      startkey: itemKey,
      endkey: itemKey + '\uffff'
    }
    debug('creating read stream',readStreamOpts)
    var readStream = cradle.oose.all(readStreamOpts)
    writeStream.on('data',function(chunk){
      result.push(chunk.id)
    })
    writeStream.on('finish',function(){
      debug('write ended',result.length,result)
      //this gives us the inventory keys and now we must select all the docs
      //and place them into the new database, so we will setup a progress bar
      progress = new ProgressBar(
        name + ' [:bar] :current/:total :percent :rate/rps :etas',
        {
          total: result.length,
          width: 50,
          complete: '=',
          incomplete: '-'
        }
      )
      P.try(function(){
        return result
      })
      .map(function(row){
        if('function' === typeof filterFunc && false === filterFunc(row)){
          throw new Error('skipped')
        }
        return cradle.oose.getAsync(row)
          .then(function(record){
            //we need the new row
            var newKey = keyFunc(record)
            record._id = newKey
            delete record._rev
            return new P(function(resolve){
              cradle[dbName].head(newKey,function(err,res,code){
                if(200 === code){
                  counter.exists++
                  resolve(true)
                }
                else{
                  counter.moved++
                  resolve(cradle[dbName].saveAsync(newKey,record))
                }
              })
            })
          })
          .then(
            function(){
            },
            function(err){
              if(err.message.match(/conflict/i)) counter.exists++
              else throw err
            }
          )
          .catch(function(err){
            if('skipped' !== err.message){
              console.log(err.stack)
              counter.error++
            }
          })
          .finally(function(){
            progress.tick()
          })
      },{concurrency: concurrency[name]})
      .then(function(){
        resolve()
      })
      .catch(function(err){
        reject(err)
      })
    })
    readStream.pipe(writeStream)
  })
}


/**
 * Run the interval
 * @param {function} done
 */
var runInterval = function(done){
  //first lets get all the purchases
  migrateItems(
    'store',
    'oose:store:',
    'peer',
    function(record){return cradle.schema.store(record.prism,record.name)}
  )
    .then(function(){
      return migrateItems(
        'prism',
        'oose:prism:',
        'peer',
        function(record){return cradle.schema.prism(record.name)}
      )
    })
    .then(function(){
      throw new Error('break')
    })
    .then(function(){
      return migrateItems(
        'inventory',
        'oose:inventory:',
        'inventory',
        function(record){
          return cradle.schema.inventory(record.hash,record.prism,record.store)
        },
        function(record){return (record.length > 0)}
      )
    })
    .then(function(){
      return migrateItems(
        'purchase',
        'oose:purchase:',
        'inventory',
        function(record){
          return cradle.schema.purchase(record.token)
        },
        function(record){return (record.length > 0)}
      )
    })
    .then(function(){
      console.log(
        'Migration complete, ' +
        counter.moved + ' moved ' +
        counter.exists + ' already exist ' +
        counter.skipped + ' skipped ' +
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

