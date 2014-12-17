'use strict';
var P = require('bluebird')
var expect = require('chai').expect
var infant = require('infant')
var promisePipe = require('promisepipe')
var request = require('request')

var APIClient = require('../helpers/APIClient')
var SHA1Stream = require('../helpers/SHA1Stream')

var content = require('./helpers/content')

var config = require('../config')

//make some promises
P.promisifyAll(infant)
P.promisifyAll(request)

describe('store',function(){
  this.timeout(5000)
  var storeServer = infant.parent('../store')
  //start servers and create a user
  before(function(){
    return storeServer.startAsync()
  })
  //remove user and stop services
  after(function(){
    return storeServer.stopAsync()
  })
  var client
  beforeEach(function(){
    client = new APIClient(config.store.port,config.store.host)
    client.setBasicAuth(config.store.username,config.store.password)
  })
  //home page
  it('should have a homepage',function(){
    return client
      .post('/')
      .spread(function(res,body){
        return P.all([
          expect(body.message).to.equal('Welcome to OOSE version ' +
          config.version)
        ])
      })
  })
  it('should ping',function(){
    return client
      .post('/ping')
      .spread(function(res,body){
        expect(body.pong).to.equal('pong')
      })
  })
  //content
  describe('store:content',function(){
    it('should upload content',function(){
      return client
        .upload('/content/upload',content.file)
        .spread(function(res,body){
          expect(body.files.file.sha1).to.equal(content.sha1)
        })
    })
    it('should download content',function(){
      var sniff = new SHA1Stream()
      return client
        .download('/content/download',{sha1: content.sha1})
        .then(function(stream){
          return promisePipe(stream,sniff)
        })
        .then(function(){
          expect(sniff.sha1).to.equal(content.sha1)
        })
    })
    it('should check if content exists',function(){
      return client
        .post('/content/exists',{sha1: content.sha1})
        .spread(function(res,body){
          expect(body.exists).to.equal(true)
        })
    })
    it('should fail for bogus content',function(){
      return client
        .post('/content/exists',{sha1: content.sha1Bogus})
        .spread(function(res,body){
          expect(body.exists).to.equal(false)
        })
    })
    it('should remove content',function(){
      return client
        .post('/content/remove',{sha1: content.sha1})
        .spread(function(res,body){
          expect(body.success).to.equal('File removed')
        })
    })
  })
  describe('store:purchase',function(){
    before(function(){
      return client
        .upload('/content/upload',content.file)
        .spread(function(res,body){
          expect(body.files.file.sha1).to.equal(content.sha1)
        })
    })
    after(function(){
      return client
        .post('/content/remove',{sha1: content.sha1})
        .spread(function(res,body){
          expect(body.success).to.equal('File removed')
        })
    })
    var purchase
    it('should allow purchase of content',function(){
      return client
        .post('/purchase/create',{sha1: content.sha1})
        .spread(function(res,body){
          expect(body.success).to.equal('Purchase created')
          expect(body.token.length).to.equal(64)
          expect(body.path).to.be.a('string')
          expect(body.ext).to.equal(content.ext)
          expect(body.life).to.equal(21600)
          purchase = {
            token: body.token,
            path: body.path,
            ext: body.ext
          }
        })
    })
    it('should find a purchase',function(){
      return client
        .post('/purchase/find',{token: purchase.token})
        .spread(function(res,body){
          expect(body.token.length).to.equal(64)
          expect(body.path).to.be.a('string')
          expect(body.ext).to.equal(content.ext)
          expect(+body.life).to.equal(21600)
        })
    })
    it('should update a purchase',function(){
      return client
        .post('/purchase/update',{token: purchase.token, ext: 'mp3'})
        .spread(function(req,body){
          expect(body.token.length).to.equal(64)
          expect(body.path).to.be.a('string')
          expect(body.ext).to.equal('mp3')
          expect(+body.life).to.equal(21600)
        })
    })
    it('should remove a purchase',function(){
      return client
        .post('/purchase/update',{token: purchase.token, ext: content.ext})
        .spread(function(){
          return client.post('/purchase/remove',{token: purchase.token})
        })
        .spread(function(req,body){
          expect(body.success).to.equal('Purchase removed')
        })
    })
  })
})
