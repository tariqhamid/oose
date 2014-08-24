'use strict';
var fs = require('graceful-fs')
var net = require('net')

var client = net.connect(3002)
client.on('connect',function(){
  var rs = fs.createReadStream(__dirname + '/../foo/foo.mp4')
  rs.pipe(client)
})
