'use strict';
var file = require('../helpers/file')
  , mesh = require('../mesh')
  , net = require('net')
  , fs = require('fs')


/**
 * Export job
 * @param {object} job
 * @param {function} done
 */
module.exports = function(job,done){
  job.log('Starting to replicate ' + job.data.sha1)
  //i need to ask mesh for the nextPeer
  mesh.nextPeer(function(err,peer){
    var rs = fs.createReadStream(file.pathFromSha1(job.data.sha1))
    var ws = net.connect(peer.port,peer.ip)
    ws.on('connect',function(){
      rs.pipe(ws)
    })
    rs.on('error',done)
    ws.on('error',done)
    rs.on('close',function(){
      done()
    })
  })
}
