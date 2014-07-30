'use strict';
var net = require('net')
  , file = require('../helpers/file')
  , config = require('../config')
  , logger = require('../helpers/logger').create('import')
  , running = false

//setup tcp server if enabled
var server
var listen = function(port,host,done){
  server = net.createServer()
  server.on('connection',function(socket){
    var remoteAddress = socket.remoteAddress
    var remotePort = socket.remotePort
    logger.info('Received import connection from ' + remoteAddress + ':' + remotePort)
    socket.on('close',function(failed){
      if(failed) logger.warning('There was an error importing from ' + remoteAddress + ':' + remotePort)
      else logger.info('Closed import connection from ' + remoteAddress + ':' + remotePort)
    })
    file.fromReadable(socket,function(err,sha1){
      socket.end(sha1)
      logger.info(sha1 + ' received on port ' + port)
      if(err) logger.warning(err)
      else logger.info(sha1 + ' imported successfully')
    })
  })
  server.listen(port,host,done)
}


/**
 * Start import
 * @param {function} done
 */
exports.start = function(done){
  if('function' !== typeof done) done = function(){}
  listen(config.get('store.import.port'),config.get('store.import.host'),function(err){
    running = true
    done(err)
  })
}


/**
 * Stop import
 * @param {function} done
 */
exports.stop = function(done){
  if('function' !== typeof done) done = function(){}
  if(server && running) server.close()
  done()
}
