'use strict';
var basicAuth = require('basic-auth-connect')
var P = require('bluebird')
var bodyParser = require('body-parser')
var Busboy = require('busboy')
var expect = require('chai').expect
var express = require('express')
var fs = require('graceful-fs')
var https = require('https')
var promisePipe = require('promisepipe')
var temp = require('temp').track()

var APIClient = require('../helpers/APIClient')
var SHA1Stream = require('../helpers/SHA1Stream')
var UserError = require('../helpers/UserError')

var config = require('../config')
var content = require('./helpers/content')

var app = express()
var server = https.createServer({
  key: fs.readFileSync(config.ssl.key),
  cert: fs.readFileSync(config.ssl.cert)
},app)

var webServerConfig = {
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
P.promisifyAll(temp)

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
app.post('/upload',function(req,res){
  var data = {}
  var files = {}
  var filePromises = []
  var busboy = new Busboy({
    highWaterMark: 65536,
    headers: req.headers
  })
  busboy.on('field',function(key,value){
    data[key] = value
  })
  busboy.on('file',function(key,file,name,encoding,mimetype){
    var sniff = new SHA1Stream()
    files[key] = {
      key: key,
      file: file,
      name: name,
      encoding: encoding,
      mimetype: mimetype
    }
    filePromises.push(
      promisePipe(file,sniff)
        .then(function(){
          files[key].sha1 = sniff.sha1
        })
    )
  })
  promisePipe(req,busboy)
    .then(function(){
      return P.all(filePromises)
    })
    .then(function(){
      res.json({data: data, files: files})
    })
})
app.post('/download',function(req,res){
  fs.createReadStream(content.file).pipe(res)
})
app.put('/put',function(req,res){
  var sniff = new SHA1Stream()
  promisePipe(req,sniff)
    .then(function(){
      res.json({sha1: sniff.sha1})
    })
})

//protected routes
app.use(basicAuth(
  webServerConfig.basicAuth.username,
  webServerConfig.basicAuth.password
))
app.post('/protected/post',function(req,res){
  res.json(req.body)
})
app.get('/protected/get',function(req,res){
  res.json(req.query)
})

describe('APIClient',function(){
  before(function(){
    return server.listenAsync(webServerConfig.port,webServerConfig.host)
  })
  after(function(){
    return server.closeAsync()
  })
  it('should populate defaults',function(){
    var client = new APIClient()
    expect(client.host).to.equal('127.0.0.1')
    expect(client.port).to.equal(80)
    expect(client.protocol).to.equal('https')
  })
  it('should accept instantiation options',function(){
    var host = 'google.com'
    var port = '443'
    var protocol = 'https'
    var client = new APIClient(port,host,{protocol: protocol})
    expect(client.host).to.equal(host)
    expect(client.port).to.equal(port)
    expect(client.protocol).to.equal(protocol)
    expect(client.baseURL).to.equal(protocol + '://' + host + ':' + port)
  })
  describe('APIClient:sessionless',function(){
    var client
    beforeEach(function(){
      client = new APIClient(webServerConfig.port,webServerConfig.host)
    })
    it('should send a get request',function(){
      return client
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
      return client
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
      return client
        .post('/error')
        .spread(function(){
          throw new Error('Error was not thrown automatically')
        })
        .catch(UserError,function(err){
          expect(err.message).to.equal('Test error')
        })
    })
    it('should bubble complex errors automatically',function(){
      return client
        .post('/error/message')
        .spread(function(){
          throw new Error('Error was not thrown automatically')
        })
        .catch(UserError,function(err){
          expect(err.message).to.equal('Test error')
        })
    })
    it('should throw on invalid response code GET',function(){
      return client
        .get('/invalid/response')
        .spread(function(){
          throw new Error('Error was not thrown automatically')
        })
        .catch(UserError,function(err){
          expect(err.message).to.equal(
            'Invalid response code (500) to GET ' +
            'https://127.0.0.1:3999/invalid/response')
        })
    })
    it('should throw on invalid response code POST',function(){
      return client
        .post('/invalid/response')
        .spread(function(){
          throw new Error('Error was not thrown automatically')
        })
        .catch(UserError,function(err){
          expect(err.message).to.equal(
            'Invalid response code (500) to POST ' +
            'https://127.0.0.1:3999/invalid/response')
        })
    })
    it('should upload a file',function(){
      return client
        .upload('/upload',content.file)
        .spread(function(req,body){
          expect(body.files.file.sha1).to.equal(content.sha1)
        })
    })
    it('should download a file',function(){
      var sniff = new SHA1Stream()
      return promisePipe(client.download('/download'),sniff)
        .then(function(){
          expect(sniff.sha1).to.equal(content.sha1)
        })
    })
    it('should put a file',function(){
      return promisePipe(fs.createReadStream(content.file),client.put('/put'))
    })
  })
  describe('APIClient:sessions',function(){
    var client
    beforeEach(function(){
      client = new APIClient(webServerConfig.port,webServerConfig.host)
      client.setSession(webServerConfig.session)
    })
    it('should send a get request',function(){
      return client
        .get('/get',{foo: 'bar'})
        .spread(function(res,body){
          if(body.error) throw new Error(body.error)
          return P.all([
            expect(res.statusCode).to.equal(200),
            expect(body.foo).to.equal('bar'),
            expect(body.$sessionToken).to.equal(webServerConfig.session.token)
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
            expect(body.$sessionToken).to.equal(webServerConfig.session.token)
          ])
        })
    })
  })
  describe('APIClient:basic auth',function(){
    var client
    beforeEach(function(){
      client = new APIClient(webServerConfig.port,webServerConfig.host)
      client.setBasicAuth(
        webServerConfig.basicAuth.username,webServerConfig.basicAuth.password)
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
