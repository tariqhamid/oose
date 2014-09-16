'use strict';
var through2 = require('through2')

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
  var warn = through2(function(chunk,enc,next){
    job.logger.warning(chunk.toString())
    next(null,chunk)
  })
  var info = through2(function(chunk,enc,next){
    job.logger.info(chunk.toString())
    next(null,chunk)
  })
  cmd.stderr.pipe(warn)
  cmd.stdout.pipe(info)
  cmd.on('error',function(err){
    done(err)
  })
  cmd.on('end',function(){
    done()
  })
  cmd.execute(parameter,options.args || [])
}
