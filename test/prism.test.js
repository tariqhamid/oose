'use strict';
var P = require('bluebird')
var expect = require('chai').expect
var infant = require('infant')
var request = require('request')

var api = require('../helpers/api')

var purchase = require('./helpers/purchase')

var config = require('../config')

//make some promises
P.promisifyAll(infant)
P.promisifyAll(request)

//setup bridge to master
var master = api.master()

var user = {
  session: {},
  username: 'test',
  password: ''
}


describe('prism',function(){
  this.timeout(5000)
  var masterServer = infant.parent('../master')
  var prismServer = infant.parent('../prism')
  //start servers and create a user
  before(function(){
    return P.all([
      masterServer.startAsync(),
      prismServer.startAsync()
    ])
      .then(function(){
        //create user
        return master.post(
          master.url('/user/create'),{username: user.username})
          .spread(function(res,body){
            user.password = body.password
            return P.all([
              expect(body.success).to.equal('User created'),
              expect(body.id).to.be.greaterThan(0),
              expect(body.password.length).to.equal(64)
            ])
          })
      })
  })
  //remove user and stop services
  after(function(){
    return master.post(
      master.url('/user/remove'),{username: user.username})
      .spread(function(res,body){
        return P.all([
          expect(body.success).to.equal('User removed'),
          expect(body.count).to.equal(1)
        ])
      })
      .then(function(){
        return P.all([
          prismServer.stopAsync(),
          masterServer.stopAsync()
        ])
      })
  })
  var client
  beforeEach(function(){
    client = api.prism(config.prism)
  })
  //home page
  it('should have a homepage',function(){
    return client
      .post('/')
      .spread(function(res,body){
        expect(body.message).to.equal(
          'Welcome to OOSE version ' + config.version)
      })
  })
  it('should ping',function(){
    return client
      .post('/ping')
      .spread(function(res,body){
        expect(body.pong).to.equal('pong')
      })
  })
  describe('prism:users',function(){
    it('should login',function(){
      return client
        .post('/user/login',{username: user.username, password: user.password})
        .spread(function(res,body){
          if(!body.session) throw new Error('No session created')
          user.session = body.session
          return P.all([
            expect(body.success).to.equal('User logged in'),
            expect(body.session).to.be.an('Object')
          ])
        })
    })
    it('should reset password',function(){
      return client
        .setSession(user.session)
        .post('/user/password/reset')
        .spread(function(res,body){
          user.password = body.password
          return P.all([
            expect(body.success).to.equal('User password reset'),
            expect(body.password.length).to.equal(64)
          ])
        })
    })
    it('should validate a session',function(){
      return client
        .setSession(user.session)
        .post('/user/session/validate')
        .spread(function(res,body){
          return P.all([
            expect(body.success).to.equal('Session valid')
          ])
        })
    })
    it('should allow a session update',function(){
      return client
        .setSession(user.session)
        .post('/user/session/update',{data: {foo: 'bar'}})
        .spread(function(res,body){
          user.session = body.session
          return P.all([
            expect(body.success).to.equal('Session updated'),
            expect(JSON.parse(body.session.data).foo).to.equal('bar')
          ])
        })
    })
    it('should logout',function(){
      return client
        .setSession(user.session)
        .post('/user/logout')
        .spread(function(res,body){
          return P.all([
            expect(body.success).to.equal('User logged out')
          ])
        })
    })
  })
  describe('prism:purchase',function(){
    it('should create a purchase',function(){
      return client
        .post('/purchase/create',{purchase: purchase})
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
        .post('/purchase/find',{token: purchase.token})
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
        .post('/purchase/update',{token: purchase.token, life: 300})
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
        .post('/purchase/remove',{token: purchase.token})
        .spread(function(res,body){
          expect(body.token).to.equal(purchase.token)
          expect(body.count).to.equal(1)
          expect(body.success).to.equal('Purchase removed')
        })
    })
  })
})
