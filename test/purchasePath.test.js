'use strict';
var P = require('bluebird')
var expect = require('chai').expect
var fs = require('graceful-fs')
var mkdirp = require('mkdirp-then')
var oose = require('oose-sdk')
var path = require('path')

var content = oose.mock.content
var purchasePath = require('../helpers/purchasePath')
var sha1File = require('../helpers/sha1File')

var config = require('../config')

var purchase
var testToken =
  'tH5ex77JRt3v4o8JP88bb44re6HWNyCdtKI732a1a27k431pWRu2AQmjbM5R5Nn3'
var testDest = path.resolve(config.root + '/purchased/' + testToken + '.mp4')

//make some promises
P.promisifyAll(fs)

describe('purchasePath',function(){
  var filePath = sha1File.toPath(content.sha1,content.ext)
  before(function(){
    return mkdirp(path.dirname(filePath))
      .then(function(){
        fs.writeFileAsync(filePath,content.data)
      })
  })
  after(function(){
    return fs.unlinkAsync(filePath)
  })
  it('should generate a token',function(){
    expect(purchasePath.generateToken().length).to.equal(64)
  })
  it('should produce a path from a token',function(){
    expect(purchasePath.toPath(testToken,'mp4')).equal(testDest)
  })
  it('should produce a token from a path',function(){
    expect(purchasePath.fromPath(testDest)).to.equal(testToken)
  })
  it('should fail to exist for non existent token',function(){
    return purchasePath.exists(testToken,content.ext)
      .then(function(result){
        expect(result).to.equal(false)
      })
  })
  it('should create a purchase',function(){
    var token = purchasePath.generateToken()
    return purchasePath.create(token,filePath)
      .then(function(result){
        purchase = result
        expect(purchase.token).to.equal(token)
        expect(purchase.path).to.be.a('string')
        expect(purchase.ext).to.equal(content.ext)
      })
  })
  it('should exist now',function(){
    return purchasePath.exists(purchase.token,purchase.ext)
      .then(function(result){
        expect(result).to.equal(true)
      })
  })
  it('should remove a purchase',function(){
    return purchasePath.remove(purchase.token,purchase.ext)
  })
  it('should no longer exist',function(){
    return purchasePath.exists(purchase.token,purchase.ext)
      .then(function(result){
        expect(result).to.equal(false)
      })
  })
})
