'use strict';
var P = require('bluebird')
var expect = require('chai').expect
var fs = require('graceful-fs')
var mkdirp = require('mkdirp-then')
var path = require('path')

var content = require('./helpers/content')
var purchasePath = require('../helpers/purchasePathNew')
var sha1File = require('../helpers/sha1FileNew')

var config = require('../config')

var purchase
var testToken =
  'tH5ex77JRt3v4o8JP88bb44re6HWNyCdtKI732a1a27k431pWRu2AQmjbM5R5Nn3'
var testDest = path.resolve(config.root + '/purchased/' + testToken + '.mp4')

//make some promises
P.promisifyAll(fs)

describe('purchasePath',function(){
  var filePath = sha1FileNew.toPath(content.sha1,content.ext)
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
    expect(purchasePathNew.generateToken().length).to.equal(64)
  })
  it('should produce a path from a token',function(){
    expect(purchasePathNew.toPath(testToken,'mp4')).equal(testDest)
  })
  it('should produce a token from a path',function(){
    expect(purchasePathNew.fromPath(testDest)).to.equal(testToken)
  })
  it('should fail to exist for non existent token',function(){
    return purchasePathNew.exists(testToken,content.ext)
      .then(function(result){
        expect(result).to.equal(false)
      })
  })
  it('should create a purchase',function(){
    return purchasePathNew.create(filePath)
      .then(function(result){
        purchase = result
        expect(purchase.token.length).to.equal(64)
        expect(purchase.path).to.be.a('string')
        expect(purchase.ext).to.equal(content.ext)
      })
  })
  it('should exist now',function(){
    return purchasePathNew.exists(purchase.token,purchase.ext)
      .then(function(result){
        expect(result).to.equal(true)
      })
  })
  it('should remove a purchase',function(){
    return purchasePathNew.remove(purchase.token,purchase.ext)
  })
  it('should no longer exist',function(){
    return purchasePathNew.exists(purchase.token,purchase.ext)
      .then(function(result){
        expect(result).to.equal(false)
      })
  })
  it('should create a redis key',function(){
    expect(purchasePathNew.redisKey(purchase.token)).to.equal(
      'purchase:' + purchase.token)
  })
})
