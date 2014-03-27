'use strict';
var net = require('net')
  , file = require('../helpers/file')
  , config = require('../config')

//setup tcp server if enabled
var listen = function(port,host,done){
  var server = net.createServer()
  server.on('connection',function(socket){
    file.fromReadable(socket,function(err,sha1){
      if(err) console.log(err)
      else console.log(sha1 + ' received from port ' + port + ' successfully')
    })
  })
  server.listen(port,host,done)
}

exports.start = function(done){
  listen(config.get('import.port'),config.get('import.host'),done)
}