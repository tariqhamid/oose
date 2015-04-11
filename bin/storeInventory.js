'use strict';
var P = require('bluebird')
var cp = require('child_process')
var lineStream = require('line-stream')
var program = require('commander')
var fs = require('graceful-fs')
var path = require('path')
var prettyBytes = require('pretty-bytes')

var config = require('../config')

//make some promises
P.promisifyAll(fs)

program
  .version(config.version)
  .option('-b, --brief','Dont display inventory only statistics')
  .option('-R, --repair','Repair broken symlinks if found')
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
  valid: 0,
  bytes: 0,
  repaired: 0
}

if(!program.quiet){
  console.log('Starting to examine store inventory')
  console.log('Content folder: ' + contentFolder)
  console.log('-----------------------')
}

var parser = lineStream()
var find = cp.spawn('find',[contentFolder,'-type','f'])
find.stdout.setEncoding('utf-8')
find.stdout.pipe(parser)
parser.on('data',function(filePath){
  if(!program.quiet){
    var stat = fs.statSync(filePath)
    counter.bytes += stat.size
  }
  var relativePath = filePath.replace(contentFolder,'')
  var linkPath = filePath.replace(/\..+$/,'')
  if(program.repair){
    if(!fs.existsSync(linkPath)){
      counter.repaired++
      fs.symlinkSync(filePath,linkPath)
    }
  }
  var sha1 = relativePath.replace(/\//g,'').replace(/\..+$/,'')
  if(!sha1.match(/^[a-f0-9]{40}$/i))
    counter.invalid++
  else {
    counter.valid++
    if(!program.brief)
      console.log(sha1)
  }
})
find.on('close',function(){
  if(program.quiet)
    process.exit(0)
  console.log('-----------------------')
  console.log('Inventory scan complete')
  console.log('  ' +
    counter.valid + ' valid ' +
    prettyBytes(counter.bytes) + ' ' +
    counter.repaired + ' repaired ' +
    counter.invalid + ' invalid ' +
    counter.warning + ' warnings ' +
    counter.error + ' errors'
  )
  process.exit(0)
})
