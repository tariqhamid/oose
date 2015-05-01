'use strict';
var P = require('bluebird')
var expect = require('chai').expect
var fs = require('graceful-fs')
var infant = require('infant')
var oose = require('oose-sdk')
var promisePipe = require('promisepipe')
var sha1stream = require('sha1-stream')

var api = require('../helpers/api')
var master = api.master()

var content = oose.mock.content

var config = require('../config')

//make some promises
P.promisifyAll(fs)
P.promisifyAll(infant)

describe('store',function(){
  this.timeout(10000)
  var masterServer = infant.parent('../master')
  var storeServer = infant.parent('../store')
  var client
  //start servers and create a user
  before(function(){
    client = api.store(config.store)
    return P.all([
      masterServer.startAsync(),
      storeServer.startAsync()
    ])
      .then(function(){
        return master
          .postAsync({
            url: master.url('/prism/create'),
            json: {
              name: 'localprism',
              domain: 'localdomain',
              site: 'localsite',
              zone: 'localzone',
              host: '127.0.0.1',
              port: 3002,
              active: true
            }
          })
          .spread(function(res,body){
            expect(body.success).to.equal('Prism instance created')
            expect(body.id).to.be.greaterThan(0)
            return master.postAsync({
              url: master.url('/store/create'),
              json: {
                prism: 'localprism',
                name: 'localstore',
                host: '127.0.0.1',
                port: 3003,
                active: true
              }
            })
          })
          .spread(function(res,body){
            expect(body.success).to.equal('Store instance created')
            expect(body.id).to.be.greaterThan(0)
          })
      })
  })
  //remove user and stop services
  after(function(){
    return master
      .postAsync({url: master.url('/store/remove'),json: {name: 'localstore'}})
      .spread(function(res,body){
        expect(body.success).to.equal('Store instance removed')
        expect(body.count).to.equal(1)
        return master
          .postAsync(
            {url: master.url('/prism/remove'),json: {name: 'localprism'}})
      })
      .spread(function(res,body){
        expect(body.success).to.equal('Prism instance removed')
      })
      .then(function(){
        return P.all([
          storeServer.stopAsync(),
          masterServer.stopAsync()
        ])
      })
  })
  //home page
  it('should have a homepage',function(){
    return client
      .postAsync(client.url('/'))
      .spread(function(res,body){
        return P.all([
          expect(body.message).to.equal('Welcome to OOSE version ' +
          config.version)
        ])
      })
  })
  it('should ping',function(){
    return client
      .postAsync(client.url('/ping'))
      .spread(function(res,body){
        expect(body.pong).to.equal('pong')
      })
  })
  //content
  describe('store:content',function(){
    it('should upload content',function(){
      return promisePipe(
        fs.createReadStream(content.file),
        client.put(
          client.url('/content/put/') + content.sha1 + '.' + content.ext)
      )
    })
    it('should check if content exists',function(){
      return client
        .postAsync({
          url: client.url('/content/exists'),
          json: {
            sha1: content.sha1
          }
        })
        .spread(function(res,body){
          expect(body.exists.exists).to.equal(true)
          expect(body.exists.ext).to.equal(content.ext)
        })
    })
    it('should check bulk content exists',function(){
      return client
        .postAsync({
          url: client.url('/content/exists'),
          json: {
            sha1: [content.sha1,content.sha1Bogus]
          }
        })
        .spread(function(res,body){
          expect(body[content.sha1].exists).to.equal(true)
          expect(body[content.sha1].ext).to.equal(content.ext)
          expect(body[content.sha1Bogus].exists).to.equal(false)
          expect(body[content.sha1Bogus].ext).to.equal('')
        })
    })
    it('should fail for bogus content',function(){
      return client
        .postAsync({
          url: client.url('/content/exists'),
          json: {sha1: content.sha1Bogus}
        })
        .spread(function(res,body){
          expect(body.exists.exists).to.equal(false)
          expect(body.exists.ext).to.equal('')
        })
    })
    it('should download content',function(){
      var sniff = sha1stream.createStream()
      return promisePipe(
        client.post({
          url: client.url('/content/download'),
          json: {sha1: content.sha1}
        }),
        sniff
      )
        .then(function(){
          expect(sniff.sha1).to.equal(content.sha1)
        })
    })
    it('should remove content',function(){
      return client
        .postAsync({
          url: client.url('/content/remove'),
          json: {sha1: content.sha1}
        })
        .spread(function(res,body){
          expect(body.success).to.equal('File removed')
        })
    })
  })
  describe('store:purchase',function(){
    before(function(){
      return promisePipe(
        fs.createReadStream(content.file),
        client.put(
          client.url('/content/put/') + content.sha1 + '.' + content.ext)
      )
    })
    after(function(){
      return client
        .postAsync({
          url: client.url('/content/remove'),
          json: {sha1: content.sha1}
        })
        .spread(function(res,body){
          expect(body.success).to.equal('File removed')
        })
    })
    var purchase
    it('should allow purchase of content',function(){
      return client
        .postAsync({
          url: client.url('/purchase/create'),
          json: {
            sha1: content.sha1,
            ext: content.ext
          }
        })
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
        .postAsync({
          url: client.url('/purchase/find'),
          json: {token: purchase.token}
        })
        .spread(function(res,body){
          expect(body.token.length).to.equal(64)
          expect(body.path).to.be.a('string')
          expect(body.ext).to.equal(content.ext)
          expect(+body.life).to.equal(21600)
        })
    })
    it('should update a purchase',function(){
      return client
        .postAsync({
          url: client.url('/purchase/update'),
          json: {token: purchase.token,ext: 'mp3'}
        })
        .spread(function(req,body){
          expect(body.token.length).to.equal(64)
          expect(body.path).to.be.a('string')
          expect(body.ext).to.equal('mp3')
          expect(+body.life).to.equal(21600)
        })
    })
    it('should remove a purchase',function(){
      return client
        .postAsync({
          url: client.url('/purchase/update'),
          json: {
            token: purchase.token,
            ext: content.ext
          }
        })
        .spread(function(){
          return client.postAsync({
            url: client.url('/purchase/remove'),
            json: {token: purchase.token}
          })
        })
        .spread(function(req,body){
          expect(body.success).to.equal('Purchase removed')
        })
    })
  })
})
