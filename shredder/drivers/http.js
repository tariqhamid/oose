'use strict';
var request = require('request')
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
 * @param {Logger} logger
 * @param {Resource} resource manager
 * @param {Parameter} parameter manager
 * @param {object} options
 * @param {function} done
 */
exports.run = function(logger,resource,parameter,options,done){
  logger.info('Retrieving resource from ' + options.get('url'))
  resource.create(options.get('name'),function(err,info){
    if(err) return done(err)
    var req = request.get(options.data)
    req.on('error',function(err){
      done(err)
    })
    req.on('response',function(res){
      var tmp = fs.createWriteStream(info.path)
      tmp.on('finish',function(){
        logger.info('Successfully retrieved resource from ' + options.get('url') + ' and saved to ' + info.path)
        done()
      })
      res.pipe(tmp)
    })
  })
}
