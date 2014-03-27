'use strict';
var redis = require('../helpers/redis')

exports.start = function(done){
  done()
}

if(require.main === module){
  exports.start(function(){
    var logger = require('../helpers/logger')
    logger.info('Balancer started')
  })
}
