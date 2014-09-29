'use strict';
var debug = require('debug')('oose:import')
var worker = require('infant').worker
var net = require('net')

var config = require('../config')
var file = require('../helpers/file')
var logger = require('../helpers/logger').create('import')

var running = false

//setup tcp server if enabled
var server = net.createServer()
var listen = function(port,host,done){
  server.on('connection',function(socket){
    var remoteAddress = socket.remoteAddress
    var remotePort = socket.remotePort
    var remoteSpec = [remoteAddress,remotePort].join(':')
    debug('Received import connection from ' + remoteSpec)
    socket.on('close',function(failed){
      if(failed)
        logger.warning('There was an error importing from ' + remoteSpec)
      else debug('Closed import connection from ' + remoteSpec)
    })
    file.fromReadable(socket,function(err,sha1){
      debug(sha1 + ' received on port ' + port)
      if(err) logger.warning(err)
      else debug(sha1 + ' imported successfully')
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
  listen(config.store.import.port,config.store.import.host,function(err){
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
  if(server && running){
    running = false
    server.close()
  }
  done()
}

if(require.main === module){
  worker(
    server,
    'oose:import:worker',
    function(done){
      exports.start(done)
    },
    function(done){
      exports.stop(done)
    }
  )
}
