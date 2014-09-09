'use strict';
var SyslogServer = require('./helpers/syslog-server')
var SyslogClient = require('./helpers/syslog-client')

var server = new SyslogServer()
var client = new SyslogClient({producer:{appName:'oose:fucker'}})

server.start(function(msg){console.log(msg)},function(){
  var address = server._sock.address()
  console.log(
      'server listening ' +
      address.address + ':' + address.port
  )
  client.send({
    severity: 'info',
    message: 'INFO!',
    structuredData: {
      'plack@host': {
        status: 'broken',
        hasTried: 'not really'
      }
    }
  })
})
