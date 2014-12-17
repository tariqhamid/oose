'use strict';
var P = require('bluebird')
var expect = require('chai').expect
var fs = require('graceful-fs')
var mkdirp = require('mkdirp-then')
var path = require('path')

var content = require('./helpers/content')
var sha1File = require('../helpers/sha1FileNew')

var config = require('../config')
var destination = path.resolve(config.root + '/content/' + content.relativePath)

//make some promises
P.promisifyAll(fs)

describe('sha1File',function(){
  it('produce a path from sha1',function(){
    expect(sha1FileNew.toPath(content.sha1,content.ext)).to.equal(destination)
  })
  it('should produce a sha1 from path',function(){
    expect(sha1FileNew.fromPath(destination)).to.equal(content.sha1)
  })
  it('should produce a short path without an extension',function(){
    expect(sha1FileNew.toPath(content.sha1)).to.equal(
      destination.replace(/\.\w+$/,''))
  })
  it('should validate a sha1',function(){
    expect(sha1FileNew.validate(content.sha1)).to.equal(true)
  })
  it('should invalidate a sha1',function(){
    expect(sha1FileNew.validate('brown')).to.equal(false)
  })
  it('should find a file by sha1',function(){
    return mkdirp(path.dirname(destination))
      .then(function(){
        return fs.writeFileAsync(destination,content.data)
      })
      .then(function(){
        return sha1FileNew.find(content.sha1)
      })
      .then(function(file){
        expect(file).to.equal(destination)
        return fs.unlinkAsync(destination)
      })
  })
})
