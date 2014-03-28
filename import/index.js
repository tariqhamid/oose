'use strict';
var net = require('net')
  , file = require('../helpers/file')
  , config = require('../config')
  , logger = require('../helpers/logger')

//setup tcp server if enabled
var listen = function(port,host,done){
  var server = net.createServer()
  server.on('connection',function(socket){
    file.fromReadable(socket,function(err,sha1){
      logger.info(sha1 + ' received from port ' + port)
      if(err) logger.warn(err)
      else logger.info(sha1 + ' imported successfully')
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