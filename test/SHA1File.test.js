'use strict';
var P = require('bluebird')
var expect = require('chai').expect
var fs = require('graceful-fs')
var mkdirp = require('mkdirp-then')
var path = require('path')

var content = require('./helpers/content')
var SHA1File = require('../helpers/SHA1File')

var config = require('../config')
var destination = path.resolve(config.root + '/content/' + content.relativePath)

//make some promises
P.promisifyAll(fs)

describe('SHA1File',function(){
  it('produce a path from sha1',function(){
    expect(SHA1File.from(content.sha1,content.ext)).to.equal(destination)
  })
  it('should produce a sha1 from path',function(){
    expect(SHA1File.to(destination)).to.equal(content.sha1)
  })
  it('should produce a short path without an extension',function(){
    expect(SHA1File.from(content.sha1)).to.equal(
      destination.replace(/\.\w+$/,''))
  })
  it('should validate a sha1',function(){
    expect(SHA1File.validate(content.sha1)).to.equal(true)
  })
  it('should invalidate a sha1',function(){
    expect(SHA1File.validate('brown')).to.equal(false)
  })
  it('should find a file by sha1',function(){
    return mkdirp(path.dirname(destination))
      .then(function(){
        return fs.writeFileAsync(destination,content.data)
      })
      .then(function(){
        return SHA1File.find(content.sha1)
      })
      .then(function(file){
        expect(file).to.equal(destination)
        return fs.unlinkAsync(destination)
      })
  })
})
