'use strict';
var restler = require('restler')
  , fs = require('fs')
  , driver = require('./driver')


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
 * @param {object} options
 * @param {function} done
 */
exports.run = function(options,done){
  var req = restler.get(options.url,options.options)
  req.on('error',function(err){
    done(err)
  })
  req.on('response',function(res){
    driver.tempFileCreate('http',function(err,info){
      if(err) return done(err)
      var tmp = fs.createWriteStream(info.path)
      res.on('end',function(){
        done()
      })
      res.pipe(tmp)
    })
  })
}
