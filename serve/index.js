'use strict';
var config = require('../config')
  , logger = require('../helpers/logger')
  , Communicator = require('../helpers/communicator')
  , fs = require('fs')
  , path = require('path')
  , mkdirp = require('mkdirp')
  , readdirp = require('readdirp')
  , es = require('event-stream')
  , ObjectManage = require('object-manage')
  , os = require('os')
  , ds = require('diskspace')

//make sure the root folder exists
if(!fs.existsSync(config.get('serve.dataRoot'))){
  mkdirp.sync(config.get('serve.dataRoot'))
}

//scan dataRoot
var rdStream = readdirp({root: path.join(config.get('serve.dataRoot'))})
rdStream.on('warn',function(err){
  console.error('non-fatal error', err)
  // optionally call stream.destroy() here in order to abort and cause 'close' to be emitted
})
rdStream.on('error',function(err){
  console.error('fatal error', err)
})
rdStream.pipe(es.mapSync(function(entry){
  return {path: entry.path, size: entry.stat.size}
})).pipe(es.stringify()).pipe(process.stdout)
console.log('done')
//setup networking
var udp = new Communicator({
  proto: 'udp4',
  port: config.get('serve.port'),
  address: config.get('serve.address')
})
udp.useReceive(function(pkt){
  if(pkt.cmd){
    switch(pkt.cmd){
    case 'GET':
      //setup one-time-use TCP server, reply with URI
      break
    case 'PUT':
      //setup one-time-use TCP listener, reply with URI
      break
    default:
      logger.warn({msg:'UNKNOWN cmd',pkt:pkt})
      break
    }
  }
})
