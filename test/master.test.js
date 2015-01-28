'use strict';
var P = require('bluebird')
var expect = require('chai').expect
var infant = require('infant')

var api = require('../helpers/api')

var config = require('../config')

//make some promises
P.promisifyAll(infant)

//master client
var client = api.master()

describe('master',function(){
  this.timeout(10000)
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
      .postAsync(client.url('/'))
      .spread(function(res,body){
        expect(body.message).to.equal('Welcome to OOSE version ' +
          config.version)
      })
  })
  it('should ping',function(){
    return client
      .postAsync(client.url('/ping'))
      .spread(function(res,body){
        expect(body.pong).to.equal('pong')
      })
  })
  //prism registry
  describe('master:prism',function(){
    it('should create',function(){
      return client
        .postAsync({
          url: client.url('/prism/create'),
          json: {
            name: 'test',
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
        })
    })
    it('should list',function(){
      return client
        .postAsync(client.url('/prism/list'))
        .spread(function(res,body){
          expect(body.prism).to.be.an('Array')
          expect(body.prism.length).to.be.greaterThan(0)
        })
    })
    it('should update',function(){
      return client
        .postAsync({
          url: client.url('/prism/update'),
          json: {
            name: 'test',
            site: 'localsite2'
          }
        })
        .spread(function(res,body){
          expect(body.success).to.equal('Prism instance updated')
        })
    })
    it('should find',function(){
      return client
        .postAsync({url: client.url('/prism/find'), json: {name: 'test'}})
        .spread(function(res,body){
          expect(body.name).to.equal('test')
          expect(body.site).to.equal('localsite2')
        })
    })
    it('should remove',function(){
      return client
        .postAsync({url: client.url('/prism/remove'), json: {name: 'test'}})
        .spread(function(res,body){
          expect(body.success).to.equal('Prism instance removed')
          expect(body.count).to.equal(1)
        })
    })
  })
  //store registry
  describe('master:store',function(){
    before(function(){
      return client
        .postAsync({
          url: client.url('/prism/create'),
          json: {
            name: 'test',
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
        })
    })
    after(function(){
      return client
        .postAsync({url: client.url('/prism/remove'),json: {name: 'test'}})
        .spread(function(res,body){
          expect(body.success).to.equal('Prism instance removed')
        })
    })
    it('should create',function(){
      return client
        .postAsync({
          url: client.url('/store/create'),
          json: {
            prism: 'test',
            name: 'test',
            host: '127.0.0.1',
            port: 3003,
            active: true
          }
        })
        .spread(function(res,body){
          expect(body.success).to.equal('Store instance created')
          expect(body.id).to.be.greaterThan(0)
        })
    })
    it('should list all',function(){
      return client
        .postAsync(client.url('/store/list'))
        .spread(function(res,body){
          expect(body.store).to.be.an('Array')
          expect(body.store.length).to.be.greaterThan(0)
        })
    })
    it('should list for a prism',function(){
      return client
        .postAsync({
          url: client.url('/store/list'),
          json: {prism: 'test'}
        })
        .spread(function(res,body){
          expect(body.store).to.be.an('Array')
          expect(body.store.length).to.be.greaterThan(0)
        })
    })
    it('should update',function(){
      return client
        .postAsync({
          url: client.url('/store/update'),
          json: {
            name: 'test',
            port: 3004
          }
        })
        .spread(function(res,body){
          expect(body.success).to.equal('Store instance updated')
        })
    })
    it('should find',function(){
      return client
        .postAsync({url: client.url('/store/find'), json: {name: 'test'}})
        .spread(function(res,body){
          expect(body.name).to.equal('test')
          expect(body.port).to.equal(3004)
        })
    })
    it('should remove',function(){
      return client
        .postAsync({url: client.url('/store/remove'), json: {name: 'test'}})
        .spread(function(res,body){
          expect(body.success).to.equal('Store instance removed')
          expect(body.count).to.equal(1)
        })
    })
  })
  //users
  describe('master:users',function(){
    var password, session
    var ip = '127.0.0.1'
    it('should create',function(){
      return client
        .postAsync({url: client.url('/user/create'), json: {username: 'test'}})
        .spread(function(res,body){
          password = body.password
          expect(body.success).to.equal('User created')
          expect(body.id).to.be.greaterThan(0)
          expect(body.password.length).to.equal(64)
        })
    })
    it('should reset password',function(){
      return client
        .postAsync({
          url: client.url('/user/password/reset'),
          json: {username: 'test'}
        })
        .spread(function(res,body){
          password = body.password
          expect(body.success).to.equal('User password reset')
          expect(body.password.length).to.equal(64)
        })
    })
    it('should login',function(){
      return client
        .postAsync({
          url: client.url('/user/login'),
          json: {
            username: 'test',
            password: password,
            ip: ip
          }
        })
        .spread(function(res,body){
          session = body.session
          expect(body.success).to.equal('User logged in')
          expect(body.session).to.be.an('Object')
          expect(body.session.token.length).to.equal(64)
        })
    })
    it('should find the session',function(){
      return client
        .postAsync({
          url: client.url('/user/session/find'),
          json: {token: session.token, ip: ip}
        })
        .spread(function(res,body){
          expect(body.session).to.be.an('Object')
          expect(body.session.token.length).to.equal(64)
        })
    })
    it('should validate the session',function(){
      return client
        .postAsync({
          url: client.url('/user/session/validate'),
          json: {token: session.token,ip: ip}
        })
        .spread(function(res,body){
          expect(body.success).to.equal('Session valid')
          expect(body.session).to.be.an('Object')
          expect(body.session.token.length).to.equal(64)
        })
    })
    it('should update the session',function(){
      return client
        .postAsync({
          url: client.url('/user/session/update'),
          json: {
            token: session.token,
            ip: ip,
            data: {foo: 'bar'}
          }
        })
        .spread(function(res,body){
          expect(body.session).to.be.an('Object')
          expect(body.session.token.length).to.equal(64)
          expect(JSON.parse(body.session.data).foo).to.equal('bar')
        })
    })
    it('should logout',function(){
      return client
        .postAsync({
          url: client.url('/user/logout'),
          json: {token: session.token,ip: ip}
        })
        .spread(function(res,body){
          expect(body.success).to.be.equal('User logged out')
        })
    })
    it('should update',function(){
      return client
        .postAsync({
          url: client.url('/user/update'),
          json: {
            username: 'test',
            active: false
          }
        })
        .spread(function(res,body){
          expect(body.success).to.equal('User updated')
        })
    })
    it('should find',function(){
      return client
        .postAsync({
          url: client.url('/user/find'),
          json: {username: 'test'}
        })
        .spread(function(res,body){
          expect(body.username).to.equal('test')
          expect(body.active).to.equal(false)
          expect(body.password).to.be.an('undefined')
        })
    })
    it('should remove',function(){
      return client
        .postAsync({
          url: client.url('/user/remove'),
          json: {username: 'test'}
        })
        .spread(function(res,body){
          expect(body.success).to.equal('User removed')
          expect(body.count).to.equal(1)
        })
    })
  })
  //memory
  describe('master:memory',function(){
    it('should create',function(){
      return client
        .postAsync({
          url: client.url('/memory/create'),
          json: {
            name: 'test',
            value: 'foo'
          }
        })
        .spread(function(res,body){
          expect(body.success).to.equal('Object created')
          expect(body.id).to.be.greaterThan(0)
        })
    })
    it('should exist',function(){
      return client
        .postAsync({url: client.url('/memory/exists'), json: {name: 'test'}})
        .spread(function(res,body){
          expect(body.exists).to.equal(true)
        })
    })
    it('should update',function(){
      return client
        .postAsync({
          url: client.url('/memory/update'),
          json: {
            name: 'test',
            value: 'foo2'
          }
        })
        .spread(function(res,body){
          expect(body.success).to.equal('Object updated')
        })
    })
    it('should find',function(){
      return client
        .postAsync({url: client.url('/memory/find'), json: {name: 'test'}})
        .spread(function(res,body){
          expect(body.name).to.equal('test')
          expect(body.value).to.equal('foo2')
        })
    })
    it('should remove',function(){
      return client
        .postAsync({url: client.url('/memory/remove'), json: {name: 'test'}})
        .spread(function(res,body){
          expect(body.success).to.equal('Object removed')
          expect(body.count).to.equal(1)
        })
    })
  })
})
