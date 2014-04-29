'use strict';
var exec = require('child_process').exec

exports.hint = function(path,done){
  var child = exec('MP4Box -inter 1250 -hint -isma -noprog ' + path,function(err,stdout,stderr){
    if(err) return done(err)
    if(stderr) return done(stderr)
    done()
  })
}

