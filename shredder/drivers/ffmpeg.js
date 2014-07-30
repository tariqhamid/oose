'use strict';
var driver = require('../helpers/driver')


/**
 * Driver name
 * @type {string}
 */
exports.name = 'ffmpeg'


/**
 * Driver Category
 * @type {string}
 */
exports.category = 'encoder'


/**
 * Driver description
 * @type {string}
 */
exports.description = 'FFMPEG video encoding platform'


/**
 * Execute the driver with the given options
 * @param {Job} job manager
 * @param {Parameter} parameter manager
 * @param {object} options
 * @param {function} done
 */
exports.run = function(job,parameter,options,done){
  console.log(options)
  driver.executeCommand('ffmpeg',job,parameter,options,done)
}
