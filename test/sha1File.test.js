'use strict';
var P = require('bluebird')
var expect = require('chai').expect
var fs = require('graceful-fs')
var mkdirp = require('mkdirp-then')
var oose = require('oose-sdk')
var path = require('path')

var content = oose.mock.content
var sha1File = require('../helpers/sha1File')

var config = require('../config')
var relativeDestination = content.relativePath
var destination = path.resolve(config.root + '/content/' + content.relativePath)

//make some promises
P.promisifyAll(fs)

describe('sha1File',function(){
  it('should produce a relative path from sha1',function(){
    expect(
      sha1File.toRelativePath(content.sha1,content.ext)
    ).to.equal(relativeDestination)
  })
  it('should produce a path from sha1',function(){
    expect(sha1File.toPath(content.sha1,content.ext)).to.equal(destination)
  })
  it('should produce a sha1 from path',function(){
    expect(sha1File.fromPath(destination)).to.equal(content.sha1)
  })
  it('should produce a short path without an extension',function(){
    expect(sha1File.toPath(content.sha1)).to.equal(
      destination.replace(/\.\w+$/,''))
  })
  it('should validate a sha1',function(){
    expect(sha1File.validate(content.sha1)).to.equal(true)
  })
  it('should invalidate a sha1',function(){
    expect(sha1File.validate('brown')).to.equal(false)
  })
  describe('sha1File:operations',function(){
    beforeEach(function(){
      return mkdirp(path.dirname(destination))
        .then(function(){
          return fs.writeFileAsync(destination,content.data)
        })
    })
    afterEach(function(){
      return fs.unlinkAsync(destination)
    })
    it('should find a file by sha1',function(){
      return sha1File.find(content.sha1)
        .then(function(file){
          expect(file).to.equal(destination)
        })
    })
    it('should have details for a file',function(){
      return sha1File.details(content.sha1 + '.' + content.ext)
        .then(function(details){
          expect(details.sha1).to.equal(content.sha1)
          expect(details.ext).to.equal(content.ext)
          expect(details.path).to.be.a('string')
          expect(details.stat).to.be.an('object')
          expect(details.exists).to.equal(true)
        })
    })
    it('should have details for a bogus file',function(){
      return sha1File.details(content.sha1Bogus + '.' + content.ext)
        .then(function(details){
          expect(details.sha1).to.equal(content.sha1Bogus)
          expect(details.ext).to.equal(content.ext)
          expect(details.path).to.be.a('string')
          expect(details.stat).to.be.an('object')
          expect(Object.keys(details.stat).length).to.equal(0)
          expect(details.exists).to.equal(false)
        })
    })
  })
})
