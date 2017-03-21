'use strict';
var P = require('bluebird')
var cp = require('child_process');

var lsof = {}
lsof.exec = function(opts){
  return new Promise(function(resolve){
    cp.exec('lsof '+opts,function(err,d){
      d = d.split('\n')
      d.pop()
      var data = []
      var headers = d.shift().toLowerCase().split(/\s+/)
      headers.forEach(function(v,k){
        if('' === v){ delete headers[k] }
      })
      d.forEach(function(v){
        v = v.split(/\s+/)
        if('KQUEUE' === v[4]){ return }
        var k = {}
        v.forEach(function(s,i){ k[headers[i]] = s })
        data.push(k)
      })
      resolve(data)
    })
  })
}

/**
 * Export client
 * @return {object} client
 */
module.exports = lsof
