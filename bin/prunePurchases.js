'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:store:purchase')
var fs = require('graceful-fs')
var infant = require('infant')
var path = require('path')
var readdirp = require('readdirp-walk')

var config = require('../config')
var cradle = require('../helpers/couchdb')

//make some promises
P.promisifyAll(fs)

var prunePurchases = function(done){
  var root = path.resolve(config.root)
  if(!fs.existsSync(root))
    done(new Error('Root folder doesnt exist'))

  var purchaseFolder = path.resolve(root + '/purchased')
  var pruneFolders = []

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
    folder: 0,
    skipped: 0,
    cleaned: 0
  }
  debug('Starting to prune purchases')
  debug('Purchase folder: ' + purchaseFolder)
  var dirstream = readdirp({
    root: purchaseFolder,
    fileFilter: [
      '!crossdomain*',
      '!favicon*',
      '!index*',
      '!oose_*'
    ],
    concurrency: (+config.store.purchasePruneConcurrency || 32)
  })
  dirstream.on('warn',function(err){
    console.log('readdirp warning',err)
  })
  dirstream.on('error',function(err){
    console.log('readdirp error',err)
    done(err)
  })
  dirstream.on('data',function(entry){
    if(entry.stat.isDirectory()){
      pruneFolders.push(entry)
      return
    }
    debug('got entry',entry.fullPath)
    var token = entry.path.replace(/[\/\\]*/,'')
    debug(token,'got token')
    //okay so we get the purchase and if it does not exist we just remove
    //the entry, if it does exist we check the date and if the date is out
    //we set it to expired, if it is already expired for the afterlife
    //interval then we delete it, this will cause the rest of the cluster
    //to prune it
    var purchaseKey = cradle.schema.purchase(token)
    cradle.db.getAsync(purchaseKey)
      .then(
        function(doc){
          var expirationDate = +new Date(doc.expirationDate)
          var now = +new Date()
          //this is a valid purchase leave it alone
          if(!doc.expired && (expirationDate > now)){
            counter.valid++
            debug(token,'valid')
            console.log('.')
          }
          //this purchase has expired but has yet to be marked expired
          //so we expire it and calculate the final expiration date
          else if(!doc.expired && (expirationDate <= now)){
            debug(token,'expired')
            counter.expired++
            doc.expired = true
            doc.afterlifeExpirationDate =
              (+new Date() + config.purchase.afterlife)
            console.log('e')
            return cradle.db.saveAsync(cradle.schema.purchase(token),doc)
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
              console.log('x')
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
          if(!err.headers || 404 !== err.headers.status) throw err
          //regular 404s we just drop our symlink
          debug(token,'purchase doesnt exist, removing ours')
          return fs.unlinkAsync(entry.fullPath)
            .then(function(){
              console.log('c')
              counter.cleaned++
            })
        }
      )
      .catch(function(err){
        counter.error++
        console.log(err.stack)
        console.log(err)
        console.log(token,'ERROR: ',err)
      })
  })
  dirstream.on('end',function(){
    //prune folders
    var promises = []
    pruneFolders.forEach(function(folder){
      promises.push(
        fs.rmdirAsync(folder.fullPath)
          .then(function(){
            counter.folder++
          })
          .catch(function(){
            counter.skipped++
          })
      )
    })
    P.all(promises).then(function(){
      done(null,counter)
    })
  })
}

var prunePurchasesAsync = P.promisify(prunePurchases)


/**
 * Run the interval
 * @param {function} done
 */
var runInterval = function(done){
  console.log('Starting to prune purchases')
  prunePurchasesAsync()
    .then(function(counter){
      console.log('Purchase prune complete')
      console.log('  ' +
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
    .finally(done)
}

if(require.main === module){
  infant.child(
    'oose:' + config.store.name + ':purchase',
    function(done){
      //setup the interval for collection from master
      runInterval(done)
    },
    function(done){
      process.nextTick(done)
    }
  )
}

