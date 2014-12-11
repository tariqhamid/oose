'use strict';
var async = require('async')
var axon = require('axon')
var crypto = require('crypto')
var debug = require('debug')('oose:helper:file')
var fs = require('graceful-fs')
var mkdirp = require('mkdirp')
var mmm = require('mmmagic')
var path = require('path')
var promisePipe = require('promisepipe')
var temp = require('temp')
var through2 = require('through2')

var redis = require('../helpers/redis')

var config = require('../config')


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
        var client = axon.socket('req')
        debug(sha1,'making locate request')
        client.connect(+config.locate.port,config.locate.host || '127.0.0.1')
        client.send({sha1: sha1},function(err,result){
          client.close()
          if(err) return next(err)
          debug(sha1,'got locate back',err,result)
          var peers = result
          for(var i in peers){
            if(peers.hasOwnProperty(i)){
              peerCount++
              if(peers[i]) cloneCount++
            }
          }
          debug(sha1,'clone count',cloneCount)
          next()
        })
      },
      //queue a clone if we need to
      function(next){
        //if we have 2 or more clones dont add more
        if(cloneCount >= 2){
          debug(sha1,'already have 2 clones, no more needed')
          return next()
        }
        //if there are less than 2 peers we cant replicate
        if(peerCount < 2){
          debug(sha1,'not enough peers to make a clone')
          return next()
        }
        //setup clone job
        debug(sha1,'need a clone sending a clone request')
        var client = axon.socket('req')
        debug(sha1,'connecting to ' +
          config.clone.host + ':' + config.clone.host)
        client.connect(+config.clone.port,config.clone.host || '127.0.0.1')
        client.send({sha1: sha1},function(err){
          client.close()
          debug(sha1,'got clone request back',err)
          if(err) return next(err)
          next()
        })
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
  var sniff = through2(function(chunk,enc,next){
    try {
      shasum.update(chunk)
      next(null,chunk)
    } catch(err){
      next(err)
    }
  })
  promisePipe(rs,sniff).then(
    function(){
      done(null,shasum.digest('hex'))
    },
    function(err){
      done('Failed in stream ' + err.source + ': ' + err.message)
    }
  )
}


/**
 * Convert a sha1 to an absolute path
 * @param {String} sha1
 * @return {string}
 */
exports.pathFromSha1 = function(sha1){
  if(!sha1 || 40 !== sha1.length) return false
  var file = path.resolve(config.root) + '/'
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
  if(!destination) return done('Invalid sha1 pass for path')
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
          copiesMin: config.clone.copies.min,
          copiesMax: config.clone.copies.max
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
 * @return {*}
 */
exports.write = function(source,sha1,done){
  if(!done) done = function(){}
  var destination = exports.pathFromSha1(sha1)
  if(!destination) return done('Invalid sha1 passed for path')
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
 * @param {stream.Readable} readable  Readable stream to import from
 * @param {function} done
 */
exports.fromReadable = function(readable,done){
  debug('new from readable request')
  var sha1 = ''
  var exists = {redis: false, fs: false}
  var destination = ''
  var destinationFolder = ''
  var tmpDir = path.resolve(config.root + '/tmp')
  if(!fs.existsSync()) mkdirp.sync(tmpDir)
  var tmp = temp.path({dir: tmpDir})
  var writable = fs.createWriteStream(tmp)
  async.series(
    [
      //setup pipes and handlers for errors and update sha1 sum
      function(next){
        var shasum = crypto.createHash('sha1')
        //setup a sniffer to capture the sha1 for integrity
        var sniff = through2(
          function(chunk,enc,next){
            try {
              shasum.update(chunk)
              next(null,chunk)
            } catch(err){
              next(err)
            }
          }
        )
        promisePipe(readable,sniff,writable).then(
          function(){
            sha1 = shasum.digest('hex')
            debug('write finished with sha1',sha1)
            next()
          },
          function(err){
            next('Failed in stream ' + err.source + ': ' + err.message)
          }
        )
      },
      //figure out our sha1 hash and setup paths
      function(next){
        destination = exports.pathFromSha1(sha1)
        if(!destination) return next('Invalid sha1 passed for path')
        destinationFolder = path.dirname(destination)
        next()
      },
      //find out if we already know the hash in redis
      function(next){
        redis.exists(sha1,function(err,result){
          if(err) return next(err)
          exists.redis = !!result
          debug(sha1,'redis existence',exists.redis)
          next()
        })
      },
      //find out if we already know the hash on the filesystem
      function(next){
        fs.exists(destination,function(result){
          exists.fs = !!result
          debug(sha1,'fs existence',exists.fs)
          next()
        })
      },
      //remove the temp file if it does exist (no longer needed)
      function(next){
        if(!exists.fs) return next()
        debug(sha1,'removing tmp file since fs has a copy')
        fs.unlink(tmp,next)
      },
      //copy on to the file system if we must
      function(next){
        if(exists.fs) return next()
        debug(sha1,'saving to filesystem')
        mkdirp(destinationFolder,function(err){
          if(err){
            return next(
              'Failed to create folder ' + destinationFolder + ' ' + err
            )
          }
          fs.rename(tmp,destination,function(err){
            if(err){
              return next(
                'Failed to rename ' + tmp + ' to ' + destination + ' ' + err
              )
            }
            debug(sha1,'finished saving to filesystem')
            next()
          })
        })
      }
    //do some final processing
    ],function(err){
      //clean up the temp file regardless
      if(fs.existsSync(tmp)){
        debug(sha1,'tmp file exists, removing it')
        fs.unlinkSync(tmp)
      }
      if(err) return done(err)
      //if we already had the file just return
      if(exists.fs && exists.redis){
        debug(sha1,'already in the system, finished')
        return done(null,sha1)
      }
      //insert into redis
      debug(sha1,'importing into redis')
      exports.redisInsert(sha1,function(err){
        if(err) return done(err)
        debug(sha1,'finished inserting into redis, trying to clone')
        queueClone(sha1,function(err){
          debug(sha1,'done trying to queue clones, finished')
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
      if(!destination) return done('Invalid sha1 passed for path')
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
