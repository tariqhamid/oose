'use strict';
var file = require('../helpers/file')
  , redis = require('../helpers/redis')
  , net = require('net')
  , fs = require('fs')


/**
 * Export job
 * @param {object} job
 * @param {function} done
 */
module.exports = function(job,done){
  job.log('Starting to replicate ' + job.data.sha1)
  var bytesSent = 0
  //i need to ask mesh for the peerNext
  redis.hgetall(job.data.sha1,function(err,hash){
    var stat = JSON.parse(hash.stat)
    redis.hetgall('peerNext',function(err,peer){
      var rs = fs.createReadStream(file.pathFromSha1(job.data.sha1))
      var ws = net.connect(peer.port,peer.ip)
      ws.on('connect',function(){
        rs.pipe(ws)
      })
      //update job progress
      rs.on('data',function(chunk){
        bytesSent += chunk.length
        job.progress(bytesSent,stat.size)
      })
      rs.on('error',done)
      ws.on('error',done)
      rs.on('close',function(){
        done()
      })
    })
  })

}
