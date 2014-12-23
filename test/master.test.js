'use strict';
var P = require('bluebird')
var expect = require('chai').expect
var infant = require('infant')
var request = require('request')

var APIClient = require('../helpers/APIClient')

var config = require('../config')

//make some promises
P.promisifyAll(infant)
P.promisifyAll(request)

//setup api client
var client = new APIClient(config.master.port,config.master.host)
client.setBasicAuth(config.master.username,config.master.password)

describe('master',function(){
  this.timeout(5000)
  var master = infant.parent('../master')
  before(function(){
    return master.startAsync()
  })
  after(function(){
    return master.stopAsync()
  })
  //home page
  it('should have a homepage',function(){
    return client
      .post('/')
      .spread(function(res,body){
        expect(body.message).to.equal('Welcome to OOSE version ' +
          config.version)
      })
  })
  it('should ping',function(){
    return client
      .post('/ping')
      .spread(function(res,body){
        expect(body.pong).to.equal('pong')
      })
  })
  //prism registry
  describe('master:prism',function(){
    it('should create',function(){
      return client
        .post('/prism/create',{
          name: 'test',
          domain: 'localdomain',
          site: 'localsite',
          zone: 'localzone',
          host: 'localhost',
          ip: '127.0.0.1',
          port: 3002
        })
        .spread(function(res,body){
          expect(body.success).to.equal('Prism instance created')
          expect(body.id).to.be.greaterThan(0)
        })
    })
    it('should list',function(){
      return client
        .post('/prism/list')
        .spread(function(res,body){
          expect(body.prism).to.be.an('Array')
          expect(body.prism.length).to.be.greaterThan(0)
        })
    })
    it('should update',function(){
      return client
        .post('/prism/update',{
          name: 'test',
          site: 'localsite2'
        })
        .spread(function(res,body){
          expect(body.success).to.equal('Prism instance updated')
        })
    })
    it('should find',function(){
      return client
        .post('/prism/find',{name: 'test'})
        .spread(function(res,body){
          return P.all([
            expect(body.name).to.equal('test'),
            expect(body.site).to.equal('localsite2')
          ])
        })
    })
    it('should remove',function(){
      return client
        .post('/prism/remove',{name: 'test'})
        .spread(function(res,body){
          return P.all([
            expect(body.success).to.equal('Prism instance removed'),
            expect(body.count).to.equal(1)
          ])
        })
    })
  })
  //store registry
  describe('master:store',function(){
    before(function(){
      return client
        .post('/prism/create',{
          name: 'test',
          domain: 'localdomain',
          site: 'localsite',
          zone: 'localzone',
          host: 'localhost',
          ip: '127.0.0.1',
          port: 3002
        })
        .spread(function(res,body){
          return P.all([
            expect(body.success).to.equal('Prism instance created'),
            expect(body.id).to.be.greaterThan(0)
          ])
        })
    })
    after(function(){
      return client
        .post('/prism/remove',{name: 'test'})
        .spread(function(res,body){
          return P.all([
            expect(body.success).to.equal('Prism instance removed')
          ])
        })
    })
    it('should create',function(){
      return client
        .post('/store/create',{
          prism: 'test',
          name: 'test',
          ip: '127.0.0.1',
          port: 3003
        })
        .spread(function(res,body){
          return P.all([
            expect(body.success).to.equal('Store instance created'),
            expect(body.id).to.be.greaterThan(0)
          ])
        })
    })
    it('should list all',function(){
      return client
        .post('/store/list')
        .spread(function(res,body){
          return P.all([
            expect(body.store).to.be.an('Array'),
            expect(body.store.length).to.be.greaterThan(0)
          ])
        })
    })
    it('should list for a prism',function(){
      return client
        .post('/store/list',{prism: 'test'})
        .spread(function(res,body){
          return P.all([
            expect(body.store).to.be.an('Array'),
            expect(body.store.length).to.be.greaterThan(0)
          ])
        })
    })
    it('should update',function(){
      return client
        .post('/store/update',{
          name: 'test',
          port: 3004
        })
        .spread(function(res,body){
          return P.all([
            expect(body.success).to.equal('Store instance updated')
          ])
        })
    })
    it('should find',function(){
      return client
        .post('/store/find',{name: 'test'})
        .spread(function(res,body){
          return P.all([
            expect(body.name).to.equal('test'),
            expect(body.port).to.equal(3004)
          ])
        })
    })
    it('should remove',function(){
      return client
        .post('/store/remove',{name: 'test'})
        .spread(function(res,body){
          return P.all([
            expect(body.success).to.equal('Store instance removed'),
            expect(body.count).to.equal(1)
          ])
        })
    })
  })
  //users
  describe('master:users',function(){
    var password, session
    var ip = '127.0.0.1'
    it('should create',function(){
      return client
        .post('/user/create',{username: 'test'})
        .spread(function(res,body){
          password = body.password
          return P.all([
            expect(body.success).to.equal('User created'),
            expect(body.id).to.be.greaterThan(0),
            expect(body.password.length).to.equal(64)
          ])
        })
    })
    it('should reset password',function(){
      return client
        .post('/user/password/reset',{username: 'test'})
        .spread(function(res,body){
          password = body.password
          return P.all([
            expect(body.success).to.equal('User password reset'),
            expect(body.password.length).to.equal(64)
          ])
        })
    })
    it('should login',function(){
      return client
        .post('/user/login',{
          username: 'test',
          password: password,
          ip: ip
        })
        .spread(function(res,body){
          session = body.session
          return P.all([
            expect(body.success).to.equal('User logged in'),
            expect(body.session).to.be.an('Object'),
            expect(body.session.token.length).to.equal(64)
          ])
        })
    })
    it('should find the session',function(){
      return client
        .post('/user/session/find',{token: session.token, ip: ip})
        .spread(function(res,body){
          return P.all([
            expect(body.session).to.be.an('Object'),
            expect(body.session.token.length).to.equal(64)
          ])
        })
    })
    it('should validate the session',function(){
      return client
        .post('/user/session/validate',{token: session.token, ip: ip})
        .spread(function(res,body){
          return P.all([
            expect(body.success).to.equal('Session valid'),
            expect(body.session).to.be.an('Object'),
            expect(body.session.token.length).to.equal(64)
          ])
        })
    })
    it('should update the session',function(){
      return client
        .post('/user/session/update',{
          token: session.token,
          ip: ip,
          data: {foo: 'bar'}
        })
        .spread(function(res,body){
          return P.all([
            expect(body.session).to.be.an('Object'),
            expect(body.session.token.length).to.equal(64),
            expect(JSON.parse(body.session.data).foo).to.equal('bar')
          ])
        })
    })
    it('should logout',function(){
      return client
        .post('/user/logout',{token: session.token, ip: ip})
        .spread(function(res,body){
          return P.all([
            expect(body.success).to.be.equal('User logged out')
          ])
        })
    })
    it('should update',function(){
      return client
        .post('/user/update',{
          username: 'test',
          active: false
        })
        .spread(function(res,body){
          return P.all([
            expect(body.success).to.equal('User updated')
          ])
        })
    })
    it('should find',function(){
      return client
        .post('/user/find',{username: 'test'})
        .spread(function(res,body){
          return P.all([
            expect(body.username).to.equal('test'),
            expect(body.active).to.equal(false),
            expect(body.password).to.be.undefined
          ])
        })
    })
    it('should remove',function(){
      return client
        .post('/user/remove',{username: 'test'})
        .spread(function(res,body){
          return P.all([
            expect(body.success).to.equal('User removed'),
            expect(body.count).to.equal(1)
          ])
        })
    })
  })
  //memory
  describe('master:memory',function(){
    it('should create',function(){
      return client
        .post('/memory/create',{
          name: 'test',
          value: 'foo'
        })
        .spread(function(res,body){
          return P.all([
            expect(body.success).to.equal('Object created'),
            expect(body.id).to.be.greaterThan(0)
          ])
        })
    })
    it('should exist',function(){
      return client
        .post('/memory/exists',{name: 'test'})
        .spread(function(res,body){
          return P.all([
            expect(body.exists).to.equal(true)
          ])
        })
    })
    it('should update',function(){
      return client
        .post('/memory/update',{
          name: 'test',
          value: 'foo2'
        })
        .spread(function(res,body){
          return P.all([
            expect(body.success).to.equal('Object updated')
          ])
        })
    })
    it('should find',function(){
      return client
        .post('/memory/find',{name: 'test'})
        .spread(function(res,body){
          return P.all([
            expect(body.name).to.equal('test'),
            expect(body.value).to.equal('foo2')
          ])
        })
    })
    it('should remove',function(){
      return client
        .post('/memory/remove',{name: 'test'})
        .spread(function(res,body){
          return P.all([
            expect(body.success).to.equal('Object removed'),
            expect(body.count).to.equal(1)
          ])
        })
    })
  })
})
