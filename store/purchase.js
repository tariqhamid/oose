'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:store:purchase')
var fs = require('graceful-fs')
var infant = require('infant')
var path = require('path')

var config = require('../config')
var cradle = require('../helpers/cradle')

var interval

//make some promises
P.promisifyAll(fs)

var prunePurchases = function(done){
  var root = path.resolve(config.root)
  if(!fs.existsSync(root))
    done(new Error('Root folder doesnt exist'))

  var purchaseFolder = path.resolve(root + '/purchased')

  if(!fs.existsSync(purchaseFolder))
    done(new Error('Purchase folder doesnt exist'))


  /**
   * Stat counters
   * @type {{warning: number, error: number, removed: number, valid: number}}
   */
  var counter = {
    warning: 0,
    error: 0,
    valid: 0,
    expired: 0,
    deleted: 0,
    skipped: 0,
    cleaned: 0
  }
  debug('Starting to prune purchases')
  debug('Purchase folder: ' + purchaseFolder)
  fs.readdirAsync(purchaseFolder)
    .map(function(name){
      var entry = {
        name: name,
        path: path.resolve(purchaseFolder + '/' + name)
      }
      debug('got entry',entry)
      var match = entry.name.match(/(\w{64})\.\w+$/)
      if(!match || !match[1]){
        debug('skipped entry',match)
        counter.skipped++
        return false
      } else {
        var token = match[1]
        debug(token,'got token')
        //okay so we get the purchase and if it does not exist we just remove
        //the entry, if it does exist we check the date and if the date is out
        //we set it to expired, if it is already expired for the afterlife
        //interval then we delete it, this will cause the rest of the cluster
        //to prune it
        var purchaseKey = cradle.schema.purchase(token)
        return cradle.db.getAsync(purchaseKey)
          .then(
            function(doc){
              var expirationDate = +new Date(doc.expirationDate)
              var now = +new Date()
              //this is a valid purchase leave it alone
              if(!doc.expired && (expirationDate > now)){
                counter.valid++
                debug(token,'valid')
              }
              //this purchase has expired but has yet to be marked expired
              //so we expire it and calculate the final expiration date
              else if(!doc.expired && (expirationDate <= now)){
                debug(token,'expired')
                counter.expired++
                doc.expired = true
                doc.afterlifeExpirationDate =
                  (+new Date() + config.purchase.afterlife)
                return cradle.db.saveAsync(
                  cradle.schme.purchase(token),
                  doc._rev,
                  doc
                )
              }
              //now we have a doc that is expired when we encounter these
              //and the afterlifeExpiration has also passed, we go ahead and
              //prune the purchase out of the database, once this happens on
              //the next prune cycle the purchase link will finally be removed
              else if(doc.expired){
                var afterlifeExpirationDate =
                  +new Date(doc.afterlifeExpirationDate)
                if(afterlifeExpirationDate < now){
                  debug(token,'afterlife expired, deleting')
                  counter.deleted++
                  return cradle.db.removeAsync(purchaseKey,doc._rev)
                }
              }
              //finally if nothing matches we throw an error
              else {
                var err = new Error('Unknown purchase rule hit ' + doc.toJSON())
                err.doc = doc
                throw err
              }
            },
            function(err){
              //throw errors we dont know about
              if(404 !== err.headers.status) throw err
              //regular 404s we just drop our symlink
              debug(token,'purchase doesnt exist, removing ours')
              return fs.unlinkAsync(entry.path)
                .then(function(){
                  counter.cleaned++
                })
            }
          )
          .catch(function(err){
            counter.error++
            console.log(err.stack)
            console.log(err)
            console.log(token,'ERROR: ',err.message)
          })
      }
    },{concurrency: 32})
    .then(function(){
      return counter
    })
    .catch(function(err){
      console.log(err.stack)
      console.log(err)
      console.log('Purchase prune error',err.message)
    })
}

var prunePurchasesAsync = P.promisify(prunePurchases)


/**
 * Run the interval
 */
var runInterval = function(){
  debug('Starting to prune purchases')
  prunePurchasesAsync()
    .then(function(counter){
      debug('Purchase prune complete')
      debug('  ' +
        counter.valid + ' valid ' +
        counter.expired + ' expired ' +
        counter.deleted + ' deleted ' +
        counter.cleaned + ' cleaned ' +
        counter.skipped + ' skipped ' +
        counter.warning + ' warnings ' +
        counter.error + ' errors'
      )
    })
    .catch(function(err){
      console.log(err.stack)
      console.log('Purchase prune error: ' + err.message)
    })
}

if(require.main === module){
  infant.child(
    'oose:' + config.store.name + ':purchase',
    function(done){
      //setup the interval for collection from master
      debug('set purchase interval')
      interval = setInterval(runInterval,config.store.purchaseFrequency)
      //do initial scan at startup
      debug('doing purchase prune')
      runInterval()
      //return now as we do not want to wait on the first scan it can be
      //lengthy
      process.nextTick(done)
    },
    function(done){
      clearInterval(interval)
      debug('cleared purchase interval')
      process.nextTick(done)
    }
  )
}

