'use strict';
var driver = require('../../helpers/driver')


/**
 * Driver name
 * @type {string}
 */
exports.name = 'mp4box'


/**
 * Driver Category
 * @type {string}
 */
exports.category = 'encode'


/**
 * Driver description
 * @type {string}
 */
exports.description = 'GPAC video encoding platform'


/**
 * Execute the driver with the given options
 * @param {Job} job manager
 * @param {Parameter} parameter manager
 * @param {object} options
 * @param {function} done
 */
exports.run = function(job,parameter,options,done){
  driver.executeCommand('MP4Box',job,parameter,options,done)
}
