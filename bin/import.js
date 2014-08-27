'use strict';
var async = require('async')
var program = require('commander')
var fs = require('graceful-fs')
var os = require('os')
var path = require('path')
var readdirp = require('readdirp')

var file = require(__dirname + '/../helpers/file')

var config = require(__dirname + '/../config')

program
  .version(config.version)
  .usage('[options] <stdin>')
  .option(
    '-d --directory <s>',
    'Root folder to import, can be omitted to disable folder scanning'
  )
  .option(
    '-c --concurrency <n>',
    'Change the number of concurrent imports, defaults to number of cpus'
  )
  .option(
    '-d --daemon',
    'Causes import to act as a daemon and watch for files in root'
  )
  .option(
    '-m --move',
    'Causes import to delete the source file on successful import'
  )
  .option('-v --verbose','Increase log output')
  .parse(process.argv)

var log = function(msg){
  if(program.verbose) console.log(msg)
}

var importScan = function(){
  var sources = []
  log('Starting import scan')
  var rs = readdirp({root: program.directory})
  rs.on('warn',console.log)
  rs.on('error',function(err){
    console.log(err)
    if(!program.daemon) process.exit()
  })
  rs.on('end',function(){
    async.eachLimit(
      sources,
      program.concurrency || os.cpus().length,
      function(source,next){
        file.fromPath(source,function(err){
          if(err) next(err)
          else {
            if(program.move) fs.unlink(source,next)
            else next()
          }
        })
      },
      function(err){
        if(err)
          console.error(err)
        log('Import scan complete')
        if(!program.daemon) process.exit()
        else setTimeout(importScan,1000)
      }
    )
  })
  rs.on('data',function(entry){
    sources.push(entry.fullPath)
  })
}
if(program.root && fs.existsSync(path.resolve(program.root))) importScan()

//read from stdin unless disabled
if(program.args[0] && '-' === program.args[0]){
  file.fromReadable(process.stdin,function(err,sha1){
    if(err) console.log(err)
    else console.log(sha1 + ' received from stdin successfully')
    process.exit()
  })
}
