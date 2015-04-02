'use strict';
var P = require('bluebird')
var program = require('commander')
var fs = require('graceful-fs')
var path = require('path')
var ProgressBar = require('progress')

var config = require('../config')
var redis = require('../helpers/redis')

//make some promises
P.promisifyAll(fs)

program
  .version(config.version)
  .option('-r, --root <s>','Folder to examine, eg /media/om101/store')
  .option('-c, --concurrency <n>','Number of files to examine concurrently, default is 32')
  .parse(process.argv)

if(!program.root)
  throw new Error('No root provided')

var root = path.resolve(program.root)
if(!fs.existsSync(root))
  throw new Error('Root folder doesnt exist')

var purchaseFolder = path.resolve(root + '/purchased')

if(!fs.existsSync(purchaseFolder))
  throw new Error('Purchase folder doesnt exist')


/**
 * Stat counters
 * @type {{warning: number, error: number, removed: number, valid: number}}
 */
var counter = {
  warning: 0,
  error: 0,
  removed: 0,
  valid: 0,
  skipped: 0,
  cleaned: 0
}

var progress = null

console.log('Starting to prune purchases')
console.log('Purchase folder: ' + purchaseFolder)
console.log('-----------------------')

fs.readdirAsync(purchaseFolder)
  .then(function(result){
    progress = new ProgressBar(
      '  migrating folders [:bar] :current/:total :percent :etas',
      {
        complete: '=',
        incomplete: ' ',
        width: 40,
        total: result.length
      }
    )
    return result 
  })
  .map(function(name){
    var entry = {
      name: name,
      path: path.resolve(purchaseFolder + '/' + name)
    }
    var match = entry.name.match(/(\w{64})\.\w+$/)
    if(!match || !match[1]){
      counter.skipped++
      progress.tick()
      return false
    } else {
      var token = match[1]
      return redis.getAsync(redis.schema.purchase(token))
        .then(function(result){
          if(!result){
            return fs.unlinkAsync(entry.path)
              .then(function(){
                counter.removed++
              })
          } else {
            counter.valid++
            console.log(token + ' still valid, skipping...')
            progress.tick()
            return true
          }
        })
        .catch(function(err){
          if('WRONGTYPE Operation against a key holding the wrong kind of value' === err.message){
            redis.del(redis.schema.purchase(token))
            counter.cleaned++
          } else {
            counter.error++
            console.log('\n' + token + ' ERROR: ' + err.message + '\n')
          }
        })
        .finally(function(){
          progress.tick()
        })
    }
  },{concurrency: program.concurrency || 32})
  .then(function(){
    console.log('-----------------------')
    console.log('Purchase prune complete')
    console.log(
      '  ' + counter.removed + ' removed ' +
      counter.valid + ' valid ' +
      counter.cleaned + ' cleaned ' +
      counter.skipped + ' skipped ' +
      counter.warning + ' warning(s) ' +
      counter.error + ' error(s)')
    process.exit(0)
  })
