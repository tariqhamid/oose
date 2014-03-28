'use strict';
var net = require('net')
  , file = require('../helpers/file')
  , config = require('../config')

//setup tcp server if enabled
var listen = function(port,host,done){
  var server = net.createServer()
  server.on('connection',function(socket){
    file.fromReadable(socket,function(err,sha1){
      console.log(sha1 + ' received from port ' + port)
      if(err) console.log(err)
      else console.log('import of ' + sha1 + ' successful')
    })
  })
  server.listen(port,host,done)
}

exports.start = function(done){
  listen(config.get('import.port'),config.get('import.host'),done)
}

if(require.main === module){
  exports.start(function(){
    var logger = require('../helpers/logger')
    logger.info('Import  started listening on port ' + config.get('import.port'))
  })
}