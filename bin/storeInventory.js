'use strict';
var P = require('bluebird')
var program = require('commander')
var fs = require('graceful-fs')
var path = require('path')
var readdirp = require('readdirp')

var config = require('../config')

//make some promises
P.promisifyAll(fs)

program
  .version(config.version)
  .option('-b, --brief','Dont display inventory only statistics')
  .option('-q, --quiet','Dont display statistics only inventory')
  .option('-r, --root <s>','Folder to examine, eg /media/om101/store')
  .parse(process.argv)

if(!program.root)
  throw new Error('No root provided')

var root = path.resolve(program.root)
if(!fs.existsSync(root))
  throw new Error('Root folder doesnt exist')

var contentFolder = path.resolve(root + '/content')

if(!fs.existsSync(contentFolder))
  throw new Error('Content folder doesnt exist')


/**
 * Stat counters
 * @type {{warning: number, error: number, removed: number, valid: number}}
 */
var counter = {
  warning: 0,
  error: 0,
  invalid: 0,
  valid: 0
}

if(!program.quiet){
  console.log('Starting to examine store inventory')
  console.log('Content folder: ' + contentFolder)
  console.log('-----------------------')
}

var stream = readdirp({root: contentFolder})
stream.on('warn',function(err){
  counter.warning++
  if(!program.brief)
    console.log('WARNING:',err)
})
stream.on('error',function(err){
  counter.error++
  console.log('ERROR:',err)
  process.exit(1)
})
stream.on('data',function(entry){
  var sha1 = entry.path.replace('/','').replace(/\..+$/,'')
  if(!sha1.match(/^[a-f0-9]{40}$/i))
    counter.invalid++
  else {
    counter.valid++
    if(!program.brief)
      console.log(sha1)
  }
})
stream.on('end',function(){
  if(program.quiet)
    process.exit(0)
  console.log('-----------------------')
  console.log('Inventory scan complete')
  console.log('  ' +
    counter.valid + ' valid ' +
    counter.invalid + ' invalid ' +
    counter.warning + ' warnings ' +
    counter.error + ' errors'
  )
  process.exit(0)
})
