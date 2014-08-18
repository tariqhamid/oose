'use strict';
var config = require('../config')
var crypto = require('crypto')
var path = require('path')
var fs = require('fs')
var mkdirp = require('mkdirp')
var redis = require('./redis')
var temp = require('temp')
var mmm = require('mmmagic')
var async = require('async')
var commUtil = require('../helpers/communicator').util


/**
 * Queue a clone of a sha1 if needed
 * @param {string} sha1
 * @param {function} done
 */
var queueClone = function(sha1,done){
  var cloneCount = 0
  var peerCount = 0
  async.series(
    [
      //do a location on the sha1
      function(next){
        var client = commUtil.tcpSend('locate',{sha1: sha1},config.get('mesh.port'),config.get('mesh.host'))
        client.once('readable',function(){
          //read our response
          var payload = commUtil.parse(client.read(client.read(2).readUInt16BE(0)))
          //close the connection
          client.end()
          //check if we got an error
          if('ok' !== payload.message.status) return next(payload.message.message)
          //make sure the response is our sha1
          if(sha1 !== payload.command) return next('Wrong command response for ' + sha1)
          for(var i in payload.message.peers){
            if(payload.message.peers.hasOwnProperty(i)){
              peerCount++
              if(payload.message.peers[i]) cloneCount++
            }
          }
          next()
        })
        client.on('error',next)
      },
      //queue a clone if we need to
      function(next){
        //if we have 2 or more clones dont add more
        if(cloneCount >= 2) return next()
        //if there are less than 2 peers we cant replicate
        if(peerCount < 2) return next()
        //setup clone job
        var clone = require('../tasks/clone')
        clone.push({sha1: sha1})
        next()
      }
    ],
    done
  )
}


/**
 * Take a file path and return a sha1 to the callback
 * @param {String} path
 * @param {Function} done
 */
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


/**
 * Convert a sha1 to an absolute path
 * @param {String} sha1
 * @return {string}
 */
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


/**
 * Convert a path back to a sha1
 * @param {string} path
 * @return {*|XML|string|void}
 */
exports.sha1FromPath = function(path){
  return path.replace(/[^a-f0-9]+/gi,'')
}


/**
 * Insert file entry into redis
 * @param {string} sha1
 * @param {function} done
 */
exports.redisInsert = function(sha1,done){
  var destination = exports.pathFromSha1(sha1)
  var magic = new mmm.Magic(mmm.MAGIC_MIME_TYPE)
  magic.detectFile(destination,function(err,mimeType){
    if(err) return done(err)
    fs.stat(destination,function(err,stat){
      if(err) return done(err)
      redis.hmset(
        'inventory:' + sha1,
        {
          stat: JSON.stringify(stat),
          mimeType: mimeType,
          copiesMin: config.get('copies.min'),
          copiesMax: config.get('copies.max')
        },
        function(err){
          if(err) return done(err)
          redis.sadd('inventory',sha1)
          done()
        }
      )
    })
  })
}


/**
 * Write a file from a source path
 * @param {string} source
 * @param {string} sha1
 * @param {function} done
 */
exports.write = function(source,sha1,done){
  if(!done) done = function(){}
  var destination = exports.pathFromSha1(sha1)
  mkdirp.sync(path.dirname(destination))
  var rs = fs.createReadStream(source)
  rs.on('error',done)
  var ws = fs.createWriteStream(destination)
  ws.on('error',done)
  rs.on('end',function(){
    exports.redisInsert(sha1,function(err){
      if(err) return done(err)
      queueClone(sha1,function(err){
        done(err,sha1)
      })
    })
  })
  rs.pipe(ws)
}


/**
 * Import a file directly from a stream
 * @param {object} readable  Readable stream to import from
 * @param {function} done
 */
exports.fromReadable = function(readable,done){
  var shasum = crypto.createHash('sha1')
  var sha1 = ''
  var exists = {redis: false, fs: false}
  var destination = ''
  var destinationFolder = ''
  var tmpDir = path.resolve(config.get('root') + '/tmp')
  if(!fs.existsSync()) mkdirp.sync(tmpDir)
  var tmp = temp.path({dir: tmpDir})
  var writable = fs.createWriteStream(tmp)
  async.series(
    [
      //setup pipes and handlers for errors and update sha1 sum
      function(next){
        readable.on('data',function(chunk){
          shasum.update(chunk)
        })
        readable.on('error',next)
        writable.on('error',next)
        readable.on('close',next)
        readable.pipe(writable)
      },
      //figure out our sha1 hash and setup paths
      function(next){
        sha1 = shasum.digest('hex')
        destination = exports.pathFromSha1(sha1)
        destinationFolder = path.dirname(destination)
        next()
      },
      //find out if we already know the hash in redis
      function(next){
        redis.exists(sha1,function(err,result){
          if(err) return next(err)
          exists.redis = result || false
          next()
        })
      },
      //find out if we already know the hash on the filesystem
      function(next){
        fs.exists(destination,function(result){
          exists.fs = result || false
          next()
        })
      },
      //remove the temp file if it does exist (no longer needed)
      function(next){
        if(exists.fs) fs.unlink(tmp,next)
        else next()
      },
      //copy on to the file system if we must
      function(next){
        if(exists.fs) return next()
        mkdirp(destinationFolder,function(err){
          if(err) return next('Failed to create folder ' + destinationFolder + ' ' + err,sha1)
          fs.rename(tmp,destination,function(err){
            if(err) return next('Failed to rename ' + tmp + ' to ' + destination + ' ' + err)
            next()
          })
        })
      }
    //do some final processing
    ],function(err){
      //clean up the temp file regardless
      if(fs.existsSync(tmp)) fs.unlinkSync(tmp)
      if(err) return done(err)
      //if we already had the file just return
      if(exists.fs && exists.redis) return done(null,sha1)
      //insert into redis
      exports.redisInsert(sha1,function(err){
        if(err) return done(err)
        queueClone(sha1,function(err){
          done(err,sha1)
        })
      })
    }
  )
}


/**
 * Same as write but does not require a sha1
 * @param {string} source
 * @param {function} done
 * @return {null}
 */
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
