'use strict';
var config = require('../config')
  , crypto = require('crypto')
  , path = require('path')
  , fs = require('fs')
  , mkdirp = require('mkdirp')
  , redis = require('./redis')
  , temp = require('temp')
  , mmm = require('mmmagic')

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
    if(i % 2 === 0 && i !== 40){
      file = file + '/'
    }
  }
  file = path.resolve(file)
  return file
}

exports.sha1FromPath = function(path){
  return path.replace(/[^a-f0-9]+/gi,'')
}

exports.redisInsert = function(sha1,done){
  var destination = exports.pathFromSha1(sha1)
  var magic = new mmm.Magic(mmm.MAGIC_MIME_TYPE)
  magic.detectFile(destination,function(err,mimeType){
    if(err) return done(err,sha1)
    fs.stat(destination,function(err,stat){
      if(err) return done(err,sha1)
      redis.hmset(sha1,{
        stat: JSON.stringify(stat),
        mimeType: mimeType,
        copiesMin: config.get('copies.min'),
        copiesMax: config.get('copies.max')
      })
      done(null,sha1)
    })
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
  var writable = fs.createWriteStream(tmp)
  var finish = function(err,sha1,exists){
    if(!exists) exists = false
    if(fs.existsSync(tmp)){
      fs.unlink(tmp,function(error){
        if(error){
          if(err) err = err + ' failed to remove tmp file ' + error
          else err = 'failed to remove tmp file ' + error
        }
        if(err) done(err,sha1)
        else exports.redisInsert(sha1,done)
      })
    } else {
      if(err) done(err,sha1)
      else if(!err && !exists) exports.redisInsert(sha1,done)
      else done(null,sha1)
    }
  }
  //listen on stdin
  readable.on('data',function(chunk){
    shasum.update(chunk)
  })
  readable.on('error',finish)
  writable.on('error',finish)
  writable.on('finish',function(){
    var sha1 = shasum.digest('hex')
    redis.hlen(sha1,function(err,len){
      if(err) return finish(err,sha1)
      var exists = (len > 0)
      var destination = exports.pathFromSha1(sha1)
      var destinationFolder = path.dirname(destination)
      var fsExists = fs.existsSync(destination)
      if(exists && fsExists) return finish(null,sha1,true)
      mkdirp(destinationFolder,function(err){
        if(err) return finish('Failed to create folder ' + destinationFolder + ' ' + err,sha1)
        fs.rename(tmp,destination,function(err){
          if(err) return finish('Failed to rename ' + tmp + ' to ' + destination + ' ' + err,sha1)
          finish(null,sha1)
        })
      })
    })
  })
  readable.pipe(writable)
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