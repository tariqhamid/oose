'use strict';
var exec = require('child_process').exec


/**
 * Hint an MP4 file for streaming
 * @param {string} path
 * @param {function} done
 */
exports.hint = function(path,done){
  exec('MP4Box -inter 1250 -hint -isma -noprog ' + path,function(err,stdout,stderr){
    if(err) return done(err)
    if(stderr) return done(stderr)
    done()
  })
}

