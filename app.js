'use strict';
var child = require('infant').child
var master = require('./master')

if(require.main === module){
  child(
    'oose:master',
    function(done){
      master.start(done)
    },
    function(done){
      master.stop(done)
    }
  )
}
