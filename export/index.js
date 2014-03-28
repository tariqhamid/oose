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
          if(req.query.download){
            res.set('Content-Disposition','attachment; filename=' + req.params.filename)
          }
          //set headers
          res.set('Content-Length',stat.size)
          res.set('Content-Type',info.mimeType)
          //setup read stream from the file
          var rs = fs.createReadStream(path)
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

exports.start = function(done){
  app.listen(config.get('export.port'),config.get('export.host'),done)
}

if(require.main === module){
  exports.start(function(){
    var logger = require('../helpers/logger')
    logger.info('Export started listening on port ' + config.get('export.port'))
  })
}