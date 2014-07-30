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
  options.set('method','POST')
  options.set('json',job.metrics.get())
  //message client
  request(options.get(),function(err){
    if(err) return done(err)
    done()
  })
}
