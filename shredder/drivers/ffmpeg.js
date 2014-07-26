'use strict';
var command = require('command')
var driver = require('../helpers/driver')
var config = require('../../config')


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
 * @param {Logger} logger
 * @param {Resource} resource manager
 * @param {object} options
 * @param {function} done
 */
exports.run = function(logger,resource,options,done){
  var exec = 'ffmpeg ' + driver.commandCompileArgs(resource,options.args)
  command.open(config.get('shredder.root'))
    .on('stdout',function(data){
      logger.info(data)
    })
    .on('stderr',function(data){
      logger.error(data)
    })
    .exec(exec)
    .then(function() {
      done()
    })
}
