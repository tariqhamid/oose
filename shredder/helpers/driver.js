'use strict';
var async = require('async')
var temp = require('temp')
var mkdirp = require('mkdirp')
var fs = require('fs')
var path = require('path')
var config = require('../../config')
var tmpDir = path.resolve(config.get('shredder.root') + '/tmp')


/**
 * Create a temp file and return the path in a callback
 * @param {string} prefix
 * @param {function} done
 */
exports.tempFileCreate = function(prefix,done){
  var tmp
  async.series(
    [
      //check if the root folder exists, if not create it
      function(next){
        fs.exists(tmpDir,function(exists){
          if(exists) return next()
          mkdirp(tmpDir,function(err){
            if(err) return next(err)
            next()
          })
        })
      },
      //create the temp path in the folder
      function(next){
        temp.open(prefix || 'shredder',function(err,info){
          if(err) return next(err)
          tmp = info
          next()
        })
      }
    ],
    function(err){
      if(err) return done(err)
      done(null,tmp)
    }
  )
}
