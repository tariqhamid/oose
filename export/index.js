'use strict';
var express = require('express')
  , app = express()
  , redis = require('../helpers/redis')
  , fs = require('fs')
  , config = require('../config')
  , file = require('../helpers/file')

app.get('/:sha1/:filename',function(req,res){
  var sha1 = req.params.sha1
  if(!sha1){
    res.send('Invalid path')
  } else {
    var path = file.pathFromSha1(sha1)
    redis.hgetall(sha1,function(err,info){
      if(err){
        console.log(err)
        res.send(err)
      } else {
        //convert stats to an object
        var stat = JSON.parse(info.stat)
        if(!fs.existsSync(path)){
          res.status(404)
          res.send('File not found')
        } else {
          //update hits
          redis.hincrby(sha1,'hits',1)
          //add attachment for a download
          if('string' === typeof req.query.download){
            res.set('Content-Disposition','attachment; filename=' + req.params.filename)
          }
          //set headers
          res.set('Accept-Ranges','bytes')
          res.set('Content-Type',info.mimeType)
          //byte range support
          var range = {start: 0, end: stat.size - 1}
          var rangeRaw = req.get('range')
          if(rangeRaw){
            var match = rangeRaw.match(/(\d+)-(\d*)/)
            if(match[1]) range.start = parseInt(match[1],10)
            if(match[2]) range.end = parseInt(match[2],10)
            res.status(206)
            res.set('Content-Range','bytes ' + range.start + '-' + range.end + '/' + stat.size)
          }
          //set content length here
          res.set('Content-Length',(range.end - range.start) + 1)
          //setup read stream from the file
          var rs = fs.createReadStream(path,range)
          //update bytes sent
          rs.on('data',function(data){
            redis.hincrby(sha1,'sent',data.length)
          })
          rs.pipe(res)
        }
      }
    })
  }
})


/**
 * Start serve and listen
 * @param {Function} done
 */
exports.start = function(done){
  app.listen(config.get('store.export.port'),config.get('store.export.host'),done)
}

if(require.main === module){
  exports.start(function(){
    var logger = require('../helpers/logger')
    logger.info('Export started listening on port ' + config.get('store.export.port'))
  })
}
