'use strict';
var program = require('commander')
  , readdirp = require('readdirp')
  , fs = require('fs')
  , file = require(__dirname + '/../helpers/file')
  , path = require('path')
  , config = require(__dirname + '/../config')
  , async = require('async')
  , net = require('net')
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
if(program.root && fs.existsSync(path.resolve(program.root))){
  importScan()
}

//read from stdin unless disabled
if(!program.noStdin){
  file.fromReadable(process.stdin,function(err,sha1){
    if(err) console.log(err)
    else console.log(sha1 + ' received from stdin successfully')
    process.exist()
  })
}

//setup tcp server if enabled
var listen = function(port){
  var server = net.createServer()
  server.on('connection',function(socket){
    file.fromReadable(socket,function(err,sha1){
      if(err) console.log(err)
      else console.log(sha1 + ' received from port ' + port + ' successfully')
    })
  })
  server.listen(port,function(){
    console.log('Listening on port ' + port)
  })
}
if(program.port) listen(program.port)