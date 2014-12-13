'use strict';
var basicAuth = require('basic-auth-connect')
var P = require('bluebird')
var bodyParser = require('body-parser')
var expect = require('chai').expect
var express = require('express')
var http = require('http')

var APIClient = require('../helpers/APIClient')
var UserError = require('../helpers/UserError')

var app = express()
var server = http.createServer(app)

var config = {
  host: null,
  port: 3999,
  session: {
    token: 'foo',
    username: 'baz'
  },
  basicAuth: {
    username: 'foo',
    password: 'bas'
  }
}

//make some promises
P.promisifyAll(server)

app.use(bodyParser.json())

//public routes
app.post('/post',function(req,res){
  res.json(req.body)
})
app.get('/get',function(req,res){
  res.json(req.query)
})
app.post('/error',function(req,res){
  res.json({error: 'Test error'})
})
app.post('/error/message',function(req,res){
  res.json({error: {message: 'Test error'}})
})
app.get('/invalid/response',function(req,res){
  res.status(500)
  res.json({success: 'Request completed'})
})
app.post('/invalid/response',function(req,res){
  res.status(500)
  res.json({success: 'Request completed'})
})

//protected routes
app.use(basicAuth(config.basicAuth.username,config.basicAuth.password))
app.post('/protected/post',function(req,res){
  res.json(req.body)
})
app.get('/protected/get',function(req,res){
  res.json(req.query)
})

describe('APIClient',function(){
  before(function(){
    return server.listenAsync(config.port,config.host)
  })
  after(function(){
    return server.closeAsync()
  })
  it('should populate defaults',function(){
    var client = new APIClient()
    expect(client.host).to.equal('127.0.0.1')
    expect(client.port).to.equal(80)
    expect(client.protocol).to.equal('http')
  })
  it('should accept instantiation options',function(){
    var host = 'google.com'
    var port = '443'
    var protocol = 'https'
    var client = new APIClient(port,host,protocol)
    expect(client.host).to.equal(host)
    expect(client.port).to.equal(port)
    expect(client.protocol).to.equal(protocol)
    expect(client.baseURL).to.equal(protocol + '://' + host + ':' + port)
  })
  describe('APIClient:sessionless',function(){
    it('should send a get request',function(){
      return new APIClient(config.port,config.host)
        .get('/get',{foo: 'bar'})
        .spread(function(res,body){
          if(body.error) throw new Error(body.error)
          return P.all([
            expect(res.statusCode).to.equal(200),
            expect(body.foo).to.equal('bar')
          ])
        })
    })
    it('should send a post request',function(){
      return new APIClient(config.port,config.host)
        .post('/post',{foo: 'baz'})
        .spread(function(res,body){
          if(body.error) throw new Error(body.error)
          return P.all([
            expect(res.statusCode).to.equal(200),
            expect(body.foo).to.equal('baz')
          ])
        })
    })
    it('should bubble errors automatically',function(){
      return new APIClient(config.port,config.host)
        .post('/error')
        .spread(function(){
          throw new Error('Error was not thrown automatically')
        })
        .catch(UserError,function(err){
          expect(err.message).to.equal('Test error')
        })
    })
    it('should bubble complex errors automatically',function(){
      return new APIClient(config.port,config.host)
        .post('/error/message')
        .spread(function(){
          throw new Error('Error was not thrown automatically')
        })
        .catch(UserError,function(err){
          expect(err.message).to.equal('Test error')
        })
    })
    it('should throw on invalid response code GET',function(){
      return new APIClient(config.port,config.host)
        .get('/invalid/response')
        .spread(function(){
          throw new Error('Error was not thrown automatically')
        })
        .catch(UserError,function(err){
          expect(err.message).to.equal(
            'Invalid response code (500) to GET ' +
            'http://127.0.0.1:3999/invalid/response')
        })
    })
    it('should throw on invalid response code POST',function(){
      return new APIClient(config.port,config.host)
        .post('/invalid/response')
        .spread(function(){
          throw new Error('Error was not thrown automatically')
        })
        .catch(UserError,function(err){
          expect(err.message).to.equal(
            'Invalid response code (500) to POST ' +
            'http://127.0.0.1:3999/invalid/response')
        })
    })
  })
  describe('APIClient:sessions',function(){
    var client
    beforeEach(function(){
      client = new APIClient(config.port,config.host)
      client.setSession(config.session)
    })
    it('should send a get request',function(){
      return client
        .get('/get',{foo: 'bar'})
        .spread(function(res,body){
          if(body.error) throw new Error(body.error)
          return P.all([
            expect(res.statusCode).to.equal(200),
            expect(body.foo).to.equal('bar'),
            expect(body.token).to.equal(config.session.token)
          ])
        })
    })
    it('should send a post request',function(){
      return client
        .post('/post',{foo: 'baz'})
        .spread(function(res,body){
          if(body.error) throw new Error(body.error)
          return P.all([
            expect(res.statusCode).to.equal(200),
            expect(body.foo).to.equal('baz'),
            expect(body.token).to.equal(config.session.token)
          ])
        })
    })
  })
  describe('APIClient:basic auth',function(){
    var client
    beforeEach(function(){
      client = new APIClient(config.port,config.host)
      client.setBasicAuth(config.basicAuth.username,config.basicAuth.password)
    })
    it('should send a get request',function(){
      return client
        .get('/protected/get',{foo: 'bar'})
        .spread(function(res,body){
          if(body.error) throw new Error(body.error)
          return P.all([
            expect(res.statusCode).to.equal(200),
            expect(body.foo).to.equal('bar')
          ])
        })
    })
    it('should send a post request',function(){
      return client
        .post('/protected/post',{foo: 'baz'})
        .spread(function(res,body){
          if(body.error) throw new Error(body.error)
          return P.all([
            expect(res.statusCode).to.equal(200),
            expect(body.foo).to.equal('baz')
          ])
        })
    })
  })
})
