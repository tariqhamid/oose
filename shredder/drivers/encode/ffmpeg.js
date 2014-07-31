'use strict';
var Command = require('../../helpers/command')


/**
 * Driver name
 * @type {string}
 */
exports.name = 'ffmpeg'


/**
 * Driver Category
 * @type {string}
 */
exports.category = 'encode'


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
  var cmd = new Command(job,'ffmpeg')
  cmd.on('stderror',function(data){
    job.logger.warning(data)
  })
  cmd.on('stdout',function(data){
    job.logger.info(data)
  })
  cmd.on('error',function(err){
    done(err)
  })
  cmd.on('end',function(){
    done()
  })
  cmd.execute(parameter,options.get('args'))
}
