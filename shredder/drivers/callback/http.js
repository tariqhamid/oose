'use strict';
var request = require('request')


/**
 * Driver name
 * @type {string}
 */
exports.name = 'http'


/**
 * Driver Category
 * @type {string}
 */
exports.category = 'callback'


/**
 * Driver description
 * @type {string}
 */
exports.description = 'Sends job updates via HTTP JSON POST'


/**
 * Execute the driver with the given options
 * @param {Job} job manager
 * @param {Parameter} parameter manager
 * @param {object} options
 * @param {function} done
 * @return {*}
 */
exports.run = function(job,parameter,options,done){
  var metrics = job.metrics.$strip()
  if(!options.url) return done('No callback URL set')
  //job.logger.info('Sending job update to ' + options.url + ' with metrics ' + JSON.stringify(metrics))
  options.method = 'POST'
  //ignore shitty ssl
  options.strictSSL = false
  //add metrics as the json body
  options.json = metrics
  //message client
  request(options,function(err){
    done(err)
  })
}
