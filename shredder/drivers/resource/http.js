'use strict';
var request = require('request')
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
  job.logger.info('Request options',options.get())
  job.logger.info('Retrieving resource from ' + options.get('url'))
  job.resource.create(options.get('name'),function(err,info){
    if(err) return done(err)
    if(!options.exists('url')) return done('No URL for retrieval of ' + (options.get('name') || 'no name'))
    job.logger.info('Request options',options.get())
    if(!options.exists('uri') && !options.exists('url')) return done('No URL provided')
    var req = request.get(options.get())
    req.on('error',function(err){
      done(err)
    })
    req.on('response',function(res){
      var frames = {
        description: 'HTTP Resource Driver, downloading ' + options.get('url'),
        complete: 0,
        total: res.headers['content-length'] || 1
      }
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
        if(frames.complete > frames.total) frames.total = frames.compelte
        job.update({frames: frames})
      })
      res.pipe(sniff).pipe(tmp)
    })
  })
}
