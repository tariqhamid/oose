'use strict';
var config = require('../config')
  , crypto = require('crypto')
  , path = require('path')
  , fs = require('fs')
  , mkdirp = require('mkdirp')
  , redis = require('./redis')

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

exports.insertToRedis = function(sha1,done){
  var destination = exports.pathFromSha1(sha1)
  fs.stat(destination,function(err,stats){
    if(err) return done(err)
    redis.hset('hashTable',sha1,JSON.stringify(stats))
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
    exports.insertToRedis(sha1,done)
  })
  rs.pipe(ws)
}