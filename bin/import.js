'use strict';
var program = require('commander')
  , redis = require(__dirname + '/../helpers/redis')
  , readdirp = require('readdirp')
  , fs = require('fs')
  , file = require(__dirname + '/../helpers/file')
  , path = require('path')
  , config = require(__dirname + '/../config')
  , async = require('async')
  , os = require('os')

program
  .version(config.get('version'))
  .option('-r --root <s>','Root folder to import')
  .option('-d --daemon','Causes import to act as a daemon and watch for files in root')
  .option('-m --move','Causes import to delete the source file on successful import')
  .option('-c --concurrency','Change the number of concurrent imports, defaults to number of cpus')
  .option('-v --verbose','Increase log output')
  .parse(process.argv)

if(!program.root || !fs.existsSync(path.resolve(program.root))){
  console.error('Root path not sent or does not exist')
  process.exit()
}

var log = function(msg){
  if(program.verbose) console.log(msg)
}

var importFile = function(source,done){
  if(!source) return done('No source provided for import ' + source)
  file.sum(source,function(err,sha1){
    if(err) return done(err)
    redis.hexists('hashTable',sha1,function(err,exists){
      var destination = file.pathFromSha1(sha1)
      var fsExists = fs.existsSync(destination)
      if(err) return done(err)
      var fileWriteDone = function(err){
        if(err) return done(err)
        if(program.move) fs.unlink(source,done)
        else done()
      }
      if(exists && fsExists){
        log(source + ' already exists')
        if(program.move) fs.unlink(source,done)
        else done()
      } else if(exists && !fsExists){
        log(source + ' already exists in redis, but not the file system... fixing')
        redis.hdel('hashTable',sha1)
        file.write(source,sha1,fileWriteDone)
      } else if(!exists && fs.existsSync){
        log(source + ' does not exists in redis, but does on the file system... fixing')
        file.insertToRedis(sha1,done)
      } else {
        log(source + ' does not exist, beginning import')
        fs.write(source,sha1,fileWriteDone)
      }
    })
  })
}

var importScan = function(){
  var sources = []
  log('Starting import scan')
  var rs = readdirp({root: program.root})
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
        importFile(source,next)
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
importScan()

//process.on('SIGINT',function(){
//  console.log('Starting shutdown, waiting for existing imports to finish...')
//})