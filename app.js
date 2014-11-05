'use strict';
var child = require('infant').child

var config = require('./config')
var master = require('./master')

if(require.main === module){
  child(
    'oose:' + config.locale.id + ':app',
    function(done){
      master.start(done)
    },
    function(done){
      master.stop(done)
    }
  )
}
