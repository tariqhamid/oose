'use strict';
var debug = require('debug')('oose:export')
var express = require('express')
var fs = require('graceful-fs')
var worker = require('infant').worker
var promisePipe = require('promisepipe')
var Q = require('q')
var through2 = require('through2')

var app = express()
var server = require('http').createServer(app)

var file = require('../helpers/file')
var redis = require('../helpers/redis')

var config = require('../config')

var rangeExp = /(\d+)-(\d*)/
var running = false

app.get('/:sha1/:filename',function(req,res){
  //first parse our req params and expand them
  Q.fcall(function(){
    var sha1 = req.params.sha1
    debug(sha1,'--------NEW REQUEST--------')
    var fileName = req.params.filename
    debug(sha1,'got filename',fileName)
    if(!sha1) throw {status: 404, message: 'invalid path'}
    if(!fileName) fileName = sha1
    var filePath = file.pathFromSha1(sha1)
    if(!filePath) throw new Error('Invalid sha1 passed for path')
    var info = {sha1: sha1, filename: fileName, filePath: filePath}
    debug(sha1,'parsed request',info)
    return info
  })
    //resolve all needed async calls
    .then(function(info){
      return Q.all([
        Q.fcall(function(){return info}),
        Q.nfcall(redis.hgetall.bind(redis),'inventory:' + info.sha1),
        Q.nfcall(redis.hincrby.bind(redis),'inventory:' + info.sha1,'hits',1)
      ])
    })
    //parse out the async responses and map into the info object
    .then(function(results){
      var info = results[0]
      if('object' !== typeof results[1])
        throw {status: 404, message: 'file not found'}
      info.file = results[1]
      if(!info.file.stat)
        throw {status: 404, message: 'file not found'}
      info.file.stat = JSON.parse(info.file.stat)
      return info
    })
    //setup the headers and range info if needed
    .then(function(info){
      //default headers
      info.headers = {
        'Accept-Range': 'bytes',
        //set some aggressive cache headers this content cant change, hence sha1
        'Cache-Control': 'public, max-age=31536000',
        'Pragma': 'public'
      }
      info.headers['Content-Type'] = info.file.mimeType
      info.headers['Content-Length'] = info.file.stat.size
      //add attachment for a download
      if('string' === typeof req.query.download){
        info.headers['Content-Disposition'] = 'attachment; filename=' +
          req.params.filename
      }
      //byte range support
      info.range = {start: 0,end: (info.file.stat.size - 1 || 0)}
      var rangeRaw = req.get('range')
      if(rangeRaw){
        var match = rangeRaw.match(rangeExp)
        if(match[1]) info.range.start = +match[1]
        if(match[2]) info.range.end = +match[2]
        res.status(206)
        info.headers['Content-Range'] = 'bytes ' + info.range.start + '-' +
          info.range.end + '/' + info.file.stat.size
        info.headers['Content-Length'] = (info.range.end - info.range.start) + 1
      }
      //validate range for sanity
      if(info.range.end < info.range.start) info.range.end = info.range.start
      return info
    })
    //setup to send the request
    .then(function(info){
      //if the file is 0 length just end now
      if(0 === info.range.start && 0 === info.range.end){
        res.status(200)
        res.set('Content-Length',0)
        res.end()
        return
      }
      //set our headers
      res.set(info.headers)
      //setup a deferred to handle this
      var defer = Q.defer()
      //setup output sniffer to track bytes sent regardless of output medium
      var bytesSent = 0
      var sniff = through2(
        function(chunk,enc,next){
          bytesSent = bytesSent + chunk.length
          next(null,chunk)
        }
      )
      //setup read stream from the file
      var rs = fs.createReadStream(info.filePath,info.range)
      //setup a close handler to deal with connection slams
      res.on('close',function(){
        debug(info.sha1,'got res.close')
        debug(info.sha1,'readable ended?',rs._readableState.ended)
        if(!rs._readableState.ended){
          debug(info.sha1,'manually closing readable to prevent leaks!')
          rs.close()
        }
        debug(info.sha1,'request complete')
        defer.resolve({sha1: info.sha1, bytesSent: bytesSent})
      })
      //execute the pipe
      promisePipe(rs,sniff,res).then(
        function(){
          debug(info.sha1,'request complete')
          defer.resolve({sha1: info.sha1, bytesSent: bytesSent})
        },
        defer.reject
      )
      return defer.promise
    })
    //teardown procedures
    .then(function(info){
      debug(info.sha1,'increase byte counter by',info.bytesSent)
      debug(info.sha1,'request delivery finished')
      return Q.nfcall(
        redis.hincrby.bind(redis),
          'inventory:' + info.sha1,
        'sent',
        info.bytesSent
      )
    })
    //error handling
    .catch(function(err){
      res.status(err.status || 500)
      res.send(err.message || err)
    })
})


/**
 * Start serve and listen
 * @param {Function} done
 */
exports.start = function(done){
  if('function' !== typeof done) done = function(){}
  server.listen(config.store.export.port,config.store.export.host,function(err){
    running = true
    done(err)
  })
}


/**
 * Stop export
 * @param {function} done
 */
exports.stop = function(done){
  if('function' !== typeof done) done = function(){}
  if(server && running){
    running = false
    if('production' === process.env.NODE_ENV){
      server.close(function(){
        done()
      })
    } else {
      server.close()
      done()
    }
  }
}

if(require.main === module){
  worker(
    server,
    'oose:' + config.locale.id + ':export:worker',
    function(done){
      exports.start(done)
    },
    function(done){
      exports.stop(done)
    }
  )
}
