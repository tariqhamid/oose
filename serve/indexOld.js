'use strict';
var Communicator = require('../helpers/Communicator')
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
