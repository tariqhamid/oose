'use strict';
var P = require('bluebird')
var expect = require('chai').expect
var fs = require('graceful-fs')
var promisePipe = require('promisepipe')

var SHA1Stream = require('../helpers/SHA1Stream')

var content = {
  file: __dirname + '/assets/test.txt',
  sha1: 'a03f181dc7dedcfb577511149b8844711efdb04f'
}

var runTest = function(){
  var sniff = new SHA1Stream()
  return promisePipe(fs.createReadStream(content.file),sniff)
    .then(function(){
      expect(sniff.sha1).to.equal(content.sha1)
    })
}

describe('SHA1Stream',function(){
  it('should accept a stream and emit a sha1',function(){
    var sha1
    var sniff = new SHA1Stream()
    sniff.on('sha1',function(result){
      sha1 = result
    })
    return promisePipe(fs.createReadStream(content.file),sniff)
      .then(function(){
        expect(sha1).to.equal(content.sha1)
      })
  })
  it('should accept a stream and store sha1',function(){
    return runTest()
  })
  it('should accept a stream on emit a sha1 1000x',function(){
    var promises = []
    for(var i = 0; i < 1000; i++){
      promises.push(runTest())
    }
    return P.all(promises)
  })
})
