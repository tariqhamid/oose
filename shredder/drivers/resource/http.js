'use strict';
var request = require('request')
var prettyBytes = require('pretty-bytes')
var Sniffer = require('../../../helpers/Sniffer')
var crypto = require('crypto')
var fs = require('fs')


/**
 * Driver name
 * @type {string}
 */
exports.name = 'http'


/**
 * Driver Category
 * @type {string}
 */
exports.category = 'resource'


/**
 * Driver description
 * @type {string}
 */
exports.description = 'Offers ability to use http as a resource retrieval method'


/**
 * Execute the driver with the given options
 * @param {Job} job manager
 * @param {Parameter} parameter manager
 * @param {object} options
 * @param {function} done
 */
exports.run = function(job,parameter,options,done){
  job.resource.create(options.get('name'),function(err,info){
    if(err) return done(err)
    if(!options.get('url') && !options.get('uri'))
      return done('No URL for retrieval of ' + (options.get('name') || 'no name'))
    if(!options.get('method')) options.set('method','get')
    job.logger.info('Retrieving resource ',options.get())
    var req = request(options.get())
    req.on('error',function(err){
      done(err)
    })
    req.on('response',function(res){
      var frames = {
        description: 'HTTP Resource Driver, downloading ' + options.get('url'),
        complete: 0,
        total: parseInt(res.headers['content-length'],10) || 0
      }
      var start = new Date()
      var shasum = crypto.createHash('sha1')
      var sniff = new Sniffer()
      sniff.on('data',function(data){
        shasum.update(data)
      })
      var tmp = fs.createWriteStream(info.path)
      tmp.on('finish',function(){
        job.resource.load(options.get('name'),{sha1: shasum.digest('hex')})
        job.logger.info('Successfully retrieved resource from ' + options.get('url') + ' and saved to ' + info.path)
        done()
      })
      res.on('error',function(err){
        done(err)
      })
      res.on('data',function(data){
        frames.complete += data.length
        if(frames.complete > frames.total) frames.total = frames.complete
        job.logger.info(
          job.handle + ' resource [' + options.get('name') + '] ' +
          prettyBytes(frames.complete || 0) + ' / ' +
          prettyBytes(frames.total || 0) + ' ' +
          ((frames.complete / frames.total) * 100).toFixed(2) + '% [' +
          prettyBytes((frames.complete / ((new Date().valueOf() - start.valueOf()) / 1000))) + 'ps]'
        )
        job.update({frames: frames})
      })
      res.pipe(sniff).pipe(tmp)
    })
  })
}
