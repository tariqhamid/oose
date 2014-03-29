'use strict';
var redis = require('../helpers/redis')
  , logger = require('../helpers/logger')

exports.start = function(done){
  done()
}

if(require.main === module){
  exports.start(function(){
    logger.info('Supervisor started')
  })
}
