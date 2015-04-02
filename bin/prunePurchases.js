'use strict';
var P = require('bluebird')
var program = require('commander')
var fs = require('graceful-fs')
var path = require('path')

var config = require('../config')
var redis = require('../helpers/redis')

//make some promises
P.promisifyAll(fs)

program
  .version(config.version)
  .option('-r, --root <s>','Folder to examine, eg /media/om101/store')
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
  valid: 0
}

console.log('Starting to prune purchases')
console.log('Purchase folder: ' + purchaseFolder)
console.log('-----------------------')

fs.readdirAsync(purchaseFolder)
  .each(function(name){
    var entry = {
      name: name,
      path: path.resolve(purchaseFolder + '/' + name)
    }
    var match = entry.name.match(/(\w{64})\.\w+$/)
    if(!match || !match[1]){
      counter.warning++
      console.log('WARN: no match for ' + entry.path)
      return false
    } else {
      var token = match[1]
      return redis.get(redis.schema.purchase(token))
        .then(function(result){
          if(!result){
            counter.removed++
            console.log(token + ' expired, removing!')
            return fs.unlinkAsync(entry.path)
          } else {
            counter.valid++
            console.log(token + ' still valid, skipping...')
            return true
          }
        })
    }
  })
  .then(function(){
    console.log('-----------------------')
    console.log('Purchase prune complete')
    console.log(
      '  ' + counter.removed + ' removed ' +
      counter.valid + ' valid ' +
      counter.warning + ' warning(s) ' +
      counter.error + ' error(s)')
    process.exit(0)
  })
