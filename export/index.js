'use strict';
var express = require('express')
  , app = express()
  , server = require('http').createServer(app)
  , redis = require('../helpers/redis')
  , fs = require('graceful-fs')
  , config = require('../config')
  , file = require('../helpers/file')
  , Sniffer = require('../helpers/Sniffer')
  , logger = require('../helpers/logger').create('export')
  , FFmpeg = require('fluent-ffmpeg')
  , async = require('async')
  , running = false

app.get('/:sha1/:filename',function(req,res){
  var sha1, filename, path, info, stat, range
  async.series(
    [
      //get sha1 and filename
      function(next){
        sha1 = req.params.sha1
        filename = req.params.filename
        if(!sha1) next('Invalid path')
        if(!filename) filename = sha1
        path = file.pathFromSha1(sha1)
        next()
      },
      //check if path exists
      function(next){
        fs.exists(path,function(exists){
          if(!exists) return next({code: 404, message: 'File doesnt exist'})
          next()
        })
      },
      //get inventory for file
      function(next){
        redis.hgetall('inventory:' + sha1,function(err,result){
          if(err) return next(err)
          if(!result) return next({code: 404,message: 'File not found'})
          info = result
          next()
        })
      },
      //convert stats to an object
      function(next){
        stat = JSON.parse(info.stat)
        next()
      },
      //update hits
      function(next){
        redis.hincrby('inventory:' + sha1,'hits',1,function(err){
          if(err) return next(err)
          next()
        })
      },
      //set headers
      function(next){
        //add attachment for a download
        if('string' === typeof req.query.download){
          res.set('Content-Disposition','attachment; filename=' + req.params.filename)
        }
        res.set('Accept-Ranges','bytes')
        res.set('Content-Type',info.mimeType)
        //set some aggressive cache headers (this content cant change, hence sha1)
        res.set('Cache-Control','public, max-age=31536000')
        res.set('Pragma','public')
        //byte range support
        range = {start: 0, end: (stat.size - 1 || 0)}
        var rangeRaw = req.get('range')
        if(rangeRaw){
          var match = rangeRaw.match(/(\d+)-(\d*)/)
          if(match[1]) range.start = parseInt(match[1],10)
          if(match[2]) range.end = parseInt(match[2],10)
          res.status(206)
          res.set('Content-Range','bytes ' + range.start + '-' + range.end + '/' + stat.size)
        }
        next()
      }

    ],
    function(err){
      if(err){
        if('string' === typeof err) err = {code: 500, message: err}
        logger.debug('Export error, code: ' + err.code + ', message: ' + err.message)
        res.status(err.code)
        res.send(err.message)
        return
      }
      //setup output sniffer to track bytes sent regardless of output medium
      var sniff = new Sniffer()
      sniff.on('data',function(data){
        redis.hincrby('inventory:' + sha1,'sent',data.length)
      })
      //setup sniffer to write to res
      sniff.pipe(res)
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
      //set content length here
      res.set('Content-Length',(range.end - range.start) + 1)
      //setup read stream from the file
      var rs = fs.createReadStream(path,range)
      rs.pipe(sniff)
    }
  )
})


/**
 * Start serve and listen
 * @param {Function} done
 */
exports.start = function(done){
  if('function' !== typeof done) done = function(){}
  server.listen(config.get('store.export.port'),config.get('store.export.host'),function(err){
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
  if(server && running) server.close()
  done()
}
