'use strict';
var program = require('commander')
  , redis = require(__dirname + '/../helpers/redis')
  , readdirp = require('readdirp')
  , fs = require('fs')
  , file = require(__dirname + '/../helpers/file')
  , path = require('path')
  , config = require(__dirname + '/../config')
  , async = require('async')
  , temp = require('temp')
  , crypto = require('crypto')
  , mkdirp = require('mkdirp')
  , os = require('os')

program
  .version(config.get('version'))
  .usage('[options] <stdin>')
  .option('-r --root <s>','Root folder to import, can be omitted to disable folder scanning')
  .option('-p --port <n>','Port to listen on for tcp input, automatically enables daemon mode')
  .option('-c --concurrency <n>','Change the number of concurrent imports, defaults to number of cpus')
  .option('-d --daemon','Causes import to act as a daemon and watch for files in root')
  .option('-m --move','Causes import to delete the source file on successful import')
  .option('--no-stdin','Disable listening on stdin for data')
  .option('-v --verbose','Increase log output')
  .parse(process.argv)

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
if(program.root && fs.existsSync(path.resolve(program.root))){
  importScan()
}

var stdin = function(){
  var shasum = crypto.createHash('sha1')
  var tmpDir = config.get('root') + '/tmp'
  if(!fs.existsSync()) mkdirp.sync(tmpDir)
  var tmp = temp.path({root: tmpDir})
  var ws = fs.createWriteStream(tmp)
  //listen on stdin
  process.stdin.on('data',function(chunk){
    shasum.update(chunk)
  })
  ws.on('finish',function(){
    var sha1 = shasum.digest('hex')
    redis.hexists('hashTable',sha1,function(err,exists){
      var fsExists = fs.existsSync(file.pathFromSha1(sha1))
      if(err) console.err(err)
      else if(exists && fsExists){
        console.log(sha1 + ' already exists')
        process.exit()
      } else {
        file.write(tmp,sha1,function(err){
          if(err) console.error(err)
          else {
            fs.unlink(tmp,function(err){
              if(err) console.log(err)
              else {
                console.log(sha1 + ' received from stdin successfully')
                process.exit()
              }
            })
          }
        })
      }
    })
  })
  process.stdin.pipe(ws)
}
if(!program.noStdin) stdin()