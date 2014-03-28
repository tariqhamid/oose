'use strict';
var config = require('../config')
  , crypto = require('crypto')
  , path = require('path')
  , fs = require('fs')
  , mkdirp = require('mkdirp')
  , redis = require('./redis')
  , temp = require('temp')

exports.sum = function(path,done){
  var shasum = crypto.createHash('sha1')
  var rs = fs.createReadStream(path)
  rs.on('end',function(){
    done(null,shasum.digest('hex'))
  })
  rs.on('error',done)
  rs.on('data',function(chunk){
    shasum.update(chunk)
  })
}

exports.pathFromSha1 = function(sha1){
  var file = path.resolve(config.get('root')) + '/'
  var parts = sha1.split('')
  for(var i = 1; i <= parts.length; i++){
    file = file + parts[i - 1]
    if(i % 2 === 0){
      file = file + '/'
    }
  }
  return file
}

exports.sha1FromPath = function(path){
  path.replace('/','')
  path.replace('\\','')
  return path
}

exports.redisInsert = function(sha1,done){
  var destination = exports.pathFromSha1(sha1)
  fs.stat(destination,function(err,stat){
    if(err) return done(err)
    redis.hmset(sha1,{
      'stat': JSON.stringify(stat),
      'copiesMin': config.get('copies.min'),
      'copiesMax': config.get('copies.max')
    })
    done()
  })
}

exports.write = function(source,sha1,done){
  if(!done) done = function(){}
  var destination = exports.pathFromSha1(sha1)
  mkdirp.sync(path.dirname(destination))
  var rs = fs.createReadStream(source)
  rs.on('error',done)
  var ws = fs.createWriteStream(destination)
  ws.on('error',done)
  rs.on('end',function(){
    exports.redisInsert(sha1,done)
  })
  rs.pipe(ws)
}

exports.fromReadable = function(readable,done){
  var shasum = crypto.createHash('sha1')
  var tmpDir = path.resolve(config.get('root') + '/tmp')
  if(!fs.existsSync()) mkdirp.sync(tmpDir)
  var tmp = temp.path({dir: tmpDir})
  var ws = fs.createWriteStream(tmp)
  //listen on stdin
  readable.on('data',function(chunk){
    shasum.update(chunk)
  })
  readable.on('error',done)
  ws.on('error',function(err){
    fs.unlink(tmp,function(error){
      if(error) err = err + ' failed to remove temp file ' + error
      done(err)
    })
  })
  ws.on('finish',function(){
    var sha1 = shasum.digest('hex')
    redis.hlen(sha1,function(err,len){
      var exists = (len > 0)
      var destination = exports.pathFromSha1(sha1)
      var destinationFolder = path.dirname(destination)
      var fsExists = fs.existsSync(destination)
      if(err) done(err,sha1)
      else if(exists && fsExists){
        done(sha1 + ' already exists',sha1)
      } else {
        mkdirp(destinationFolder,function(err){
          if(err){
            err = 'Failed to create folder ' + destinationFolder + ' ' + err
            fs.unlink(tmp,function(error){
              if(error) err = err + ' failed to remove tmp file ' + error
              done(err)
            })
          } else {
            fs.rename(tmp,destination,function(err){
              if(err){
                fs.unlink(tmp,function(error){
                  if(error) err = err + ' failed to remove tmp file' + error
                  done(err,sha1)
                })
              } else {
                done(null,sha1)
              }
            })
          }
        })
      }
    })
  })
  readable.pipe(ws)
}

exports.fromPath = function(source,done){
  if(!source) return done('No source provided for import ' + source)
  exports.sum(source,function(err,sha1){
    if(err) return done(err)
    redis.hexists('hashTable',sha1,function(err,exists){
      var destination = exports.pathFromSha1(sha1)
      var fsExists = fs.existsSync(destination)
      if(err) return done(err)
      var fileWriteDone = function(err){
        if(err) return done(err)
        else done()
      }
      if(exists && fsExists){
        done(source + ' already exists')
      } else if(exists && !fsExists){
        redis.hdel('hashTable',sha1)
        exports.write(source,sha1,fileWriteDone)
      } else if(!exists && fs.existsSync){
        exports.redisInsert(sha1,done)
      } else {
        exports.write(source,sha1,fileWriteDone)
      }
    })
  })
}