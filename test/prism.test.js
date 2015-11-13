'use strict';
var P = require('bluebird')
var expect = require('chai').expect
var infant = require('infant')
var oose = require('oose-sdk')
var request = require('request')

var api = require('../helpers/api')

var purchase = oose.mock.purchase

var config = require('../config')

//make some promises
P.promisifyAll(infant)
P.promisifyAll(request)

var user = {
  session: {},
  username: 'test',
  password: ''
}


describe('prism',function(){
  this.timeout(10000)
  var prismServer = infant.parent('../prism')
  var client
  //start servers and create a user
  before(function(){
    client = api.prism(config.prism)
    return prismServer.startAsync()
  })
  //remove user and stop services
  after(function(){
    return prismServer.stopAsync()
  })
  //home page
  describe('prism:basic',function(){
    it('should have a homepage',function(){
      return client
        .postAsync(client.url('/'))
        .spread(function(res,body){
          expect(body.message).to.equal(
            'Welcome to OOSE version ' + config.version)
        })
    })
    it('should ping',function(){
      return client
        .postAsync(client.url('/ping'))
        .spread(function(res,body){
          expect(body.pong).to.equal('pong')
        })
    })
  })
  describe('prism:users',function(){
    it('should login',function(){
      return client
        .postAsync({
          url: client.url('/user/login'),
          json: {
            username: config.couchdb.options.auth.username,
            password: config.couchdb.options.auth.password
          }
        })
        .spread(function(res,body){
          if(!body.session) throw new Error('No session created')
          user.session = body.session
          expect(body.success).to.equal('User logged in')
          expect(body.session).to.be.an('Object')
        })
    })
    it('should validate a session',function(){
      return api.setSession(user.session,client)
        .postAsync({url: client.url('/user/session/validate'), json: true})
        .spread(function(res,body){
          expect(body.success).to.equal('Session valid')
          expect(body.session).to.be.an('object')
          expect(body.session.token).to.be.a('string')
        })
    })
    it('should logout',function(){
      return api.setSession(user.session,client)
        .postAsync({url: client.url('/user/logout'), json: true})
        .spread(function(res,body){
          expect(body.success).to.equal('User logged out')
        })
    })
  })
  describe.skip('prism:purchase',function(){
    it('should create a purchase',function(){
      return client
        .postAsync({
          url: client.url('/purchase/create'),
          json: {purchase: purchase}
        })
        .spread(function(res,body){
          expect(body.token).to.equal(purchase.token)
          expect(body.sha1).to.equal(purchase.sha1)
          expect(body.ext).to.equal(purchase.ext)
          expect(body.life).to.equal(purchase.life)
          expect(body.created).to.be.a('number')
          expect(body.map).to.be.an('object')
        })
    })
    it('should find a purchase',function(){
      return client
        .postAsync({
          url: client.url('/purchase/find'),
          json: {token: purchase.token}
        })
        .spread(function(res,body){
          expect(body.token).to.equal(purchase.token)
          expect(body.sha1).to.equal(purchase.sha1)
          expect(body.ext).to.equal(purchase.ext)
          expect(body.life).to.equal(purchase.life)
          expect(body.created).to.be.a('number')
          expect(body.updated).to.be.a('number')
          expect(body.map).to.be.an('object')
        })
    })
    it('should update a purchase',function(){
      return client
        .postAsync({
          url: client.url('/purchase/update'),
          json: {token: purchase.token, life: 300}
        })
        .spread(function(res,body){
          expect(body.token).to.equal(purchase.token)
          expect(body.sha1).to.equal(purchase.sha1)
          expect(body.ext).to.equal(purchase.ext)
          expect(body.life).to.equal(300)
          expect(body.created).to.be.a('number')
          expect(body.updated).to.be.greaterThan(body.created)
          expect(body.map).to.be.an('object')
        })
    })
    it('should remove a purchase',function(){
      return client
        .postAsync({
          url: client.url('/purchase/remove'),
          json: {token: purchase.token}
        })
        .spread(function(res,body){
          expect(body.token).to.equal(purchase.token)
          expect(body.count).to.equal(1)
          expect(body.success).to.equal('Purchase removed')
        })
    })
  })
})
