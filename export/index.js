'use strict';
var async = require('async')
var debug = require('debug')('oose:export')
var dump = require('debug')('oose:export:dump')
var express = require('express')
var FFmpeg = require('fluent-ffmpeg')
var fs = require('graceful-fs')

var app = express()
var server = require('http').createServer(app)

var file = require('../helpers/file')
var logger = require('../helpers/logger').create('export')
var redis = require('../helpers/redis')
var Sniffer = require('../helpers/sniffer')

var config = require('../config')

var running = false

app.get('/:sha1/:filename',function(req,res){
  var sha1, filename, path, info, stat, range
  var status = 200
  //default headers
  var headers = {
    'Accept-Range': 'bytes',
    //set some aggressive cache headers this content cant change, hence sha1
    'Cache-Control': 'public, max-age=31536000',
    'Pragma': 'public'
  }
  async.series(
    [
      //get sha1 and filename
      function(next){
        sha1 = req.params.sha1
        debug(sha1,'--------NEW REQUEST--------')
        filename = req.params.filename
        debug(sha1,'got filename',filename)
        if(!sha1) next('Invalid path')
        if(!filename) filename = sha1
        path = file.pathFromSha1(sha1)
        debug(sha1,'got local path',path)
        next()
      },
      //check if path exists
      function(next){
        fs.exists(path,function(exists){
          if(!exists){
            debug(sha1,'path does not exist, throwing 404')
            status = 404
            return next('File doesnt exist')
          }
          debug(sha1,'confirmed path exists')
          next()
        })
      },
      //get inventory for file
      function(next){
        redis.hgetall('inventory:' + sha1,function(err,result){
          if(err){
            debug(sha1,'could not get inventory',err)
            return next(err)
          }
          if(!result){
            debug(sha1,'no inventory found, throwing 404')
            status = 404
            return next('File not found')
          }
          dump(sha1,'got inventory record',result)
          debug(sha1,'got inventory record')
          info = result
          next()
        })
      },
      //convert stats to an object
      function(next){
        stat = JSON.parse(info.stat)
        dump(sha1,'decoded stats',stat)
        debug(sha1,'decoded stats')
        next()
      },
      //update hits
      function(next){
        redis.hincrby('inventory:' + sha1,'hits',1,function(err){
          if(err)
            logger.warning('Failed to increment hits(' + sha1 + '): ' + err)
          debug(sha1,'incremented hits')
          next()
        })
      },
      //set headers
      function(next){
        headers['Content-Type'] = info.mimeType
        headers['Content-Length'] = stat.size
        //add attachment for a download
        if('string' === typeof req.query.download){
          headers['Content-Disposition'] =
            'attachment; filename=' + req.params.filename
        }
        //byte range support
        range = {start: 0, end: (stat.size - 1 || 0)}
        var rangeRaw = req.get('range')
        if(rangeRaw){
          var match = rangeRaw.match(/(\d+)-(\d*)/)
          if(match[1]) range.start = +match[1]
          if(match[2]) range.end = +match[2]
          status = 206
          headers['Content-Range'] =
            'bytes ' +
            range.start + '-' + range.end + '/' + stat.size
          headers['Content-Length'] = (range.end - range.start) + 1
        }
        dump(sha1,'finished setting headers',headers)
        debug(sha1,'finished setting headers')
        next()
      }
    ],
    function(err){
      if(err){
        if('string' === typeof err) status = 500
        debug(sha1,'Request failed',status,err)
        res.status(status)
        res.send(err)
        return
      }
      //set our status
      res.status(status)
      //set our headers
      res.set(headers)
      //setup output sniffer to track bytes sent regardless of output medium
      var sniff = new Sniffer()
      var bytesSent = 0
      sniff.on('data',function(data){
        sniff.pause()
        bytesSent += data.length
        sniff.resume()
      })
      //start param support
      if(req.query.start && 'video/mp4' === info.mimeType){
        var ffmpeg = new FFmpeg({source: path})
        ffmpeg.setStartTime(req.query.start)
        //tell ffmpeg to write to our sniffer
        ffmpeg.writeToStream(sniff,{end: true})
        return
      }
      //validate range for sanity
      if(range.end < range.start) range.end = range.start
      //if the file is 0 length just end now
      if(0 === range.start && 0 === range.end){
        res.status(200)
        res.set('Content-Length',0)
        res.end()
        return
      }
      //setup read stream from the file
      var rs = fs.createReadStream(path,range)
      res.on('finish',function(){
        debug(sha1,'increase byte counter by',bytesSent)
        redis.hincrby('inventory:' + sha1,'sent',bytesSent)
        debug(sha1,'request delivery finished')
      })
      res.on('close',function(){
        debug(sha1,'got res.close')
        debug(sha1,'readable ended?',rs._readableState.ended)
        if(!rs._readableState.ended){
          debug(sha1,'manually closing readable to prevent leaks!')
          rs.close()
        }
        debug(sha1,'increase byte counter by',bytesSent)
        redis.hincrby('inventory:' + sha1,'sent',bytesSent)
        debug(sha1,'request complete')
      })
      rs.pipe(sniff).pipe(res)
    }
  )
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
    server.close()
  }
  done()
}
