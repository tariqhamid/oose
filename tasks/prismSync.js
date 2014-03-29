'use strict';
var logger = require('../helpers/logger')
//  , redis = require('../helpers/redis')


/**
 * Export task
 * @param {object} job
 * @param {function} done
 */
module.exports = function(job,done){
  logger.info('Prism beginning to sync its master hash inventory')
  //need to iterate peers here and then download the inventory somehow
  done()
}
