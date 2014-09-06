'use strict';
var child = require('../../helpers/child').child
var error = false

process.on('message',function(msg){
  if('ping' === msg) process.send('pong')
  if('error' === msg) error = true
})

child(
  //startup
  function(done){
    done()
  },
  //shutdown
  function(done){
    if(error) done('failed')
    else done()
  }
)
