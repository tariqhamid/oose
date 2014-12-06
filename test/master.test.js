'use strict';
var P = require('bluebird')
var expect = require('chai').expect
var infant = require('infant')
var request = require('request')

var config = require('../config')

//make some promises
P.promisifyAll(infant)
P.promisifyAll(request)



var baseUrl = 'http://' +
  (config.master.host || 'localhost') +
  ':' + config.master.port


/**
 * Make a request to the master
 * @param {string} uri
 * @param {object} data
 * @return {P}
 */
var makeRequest = function(uri,data){
  uri = baseUrl + (uri || '/')
  return request.postAsync(
    uri,
    {
      auth: {
        username: config.master.username,
        password: config.master.password
      },
      json: data || {}
    }
  )
}

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
    return makeRequest()
      .spread(function(res,body){
        return P.all([
          expect(res.statusCode).to.equal(200),
          expect(body.message).to.equal('Welcome to OOSE version ' +
            config.version)
        ])
      })
  })
  //prism registry
  describe('prism',function(){
    it('should create',function(){
      return makeRequest('/prism/create',{
        name: 'test',
        domain: 'localdomain',
        site: 'localsite',
        zone: 'localzone',
        host: 'localhost',
        ip: '127.0.0.1',
        port: 3002
      })
        .spread(function(res,body){
          if(body.error) throw new Error(body.error)
          return P.all([
            expect(res.statusCode).to.equal(200),
            expect(body.success).to.equal('Store instance created'),
            expect(body.id).to.be.greaterThan(0)
          ])
        })
    })
    it('should list',function(){
      return makeRequest('/prism/list')
        .spread(function(res,body){
          if(body.error) throw new Error(body.error)
          return P.all([
            expect(res.statusCode).to.equal(200),
            expect(body.prism).to.be.an('Array'),
            expect(body.prism.length).to.be.greaterThan(0)
          ])
        })
    })
    it('should update',function(){
      return makeRequest('/prism/update',{
          name: 'test',
          site: 'localsite2'}
      )
        .spread(function(res,body){
          if(body.error) throw new Error(body.error)
          return P.all([
            expect(res.statusCode).to.equal(200),
            expect(body.success).to.equal('Store instance updated')
          ])
        })
    })
    it('should find',function(){
      return makeRequest('/prism/find',{name: 'test'})
        .spread(function(res,body){
          if(body.error) throw new Error(body.error)
          return P.all([
            expect(res.statusCode).to.equal(200),
            expect(body.name).to.equal('test'),
            expect(body.site).to.equal('localsite2')
          ])
        })
    })
    it('should remove',function(){
      return makeRequest('/prism/remove',{name: 'test'})
        .spread(function(res,body){
          if(body.error) throw new Error(body.error)
          return P.all([
            expect(res.statusCode).to.equal(200),
            expect(body.success).to.equal('Store instance removed'),
            expect(body.count).to.equal(1)
          ])
        })
    })
  })
  //store registry
  describe('store',function(){
    before(function(){
      return makeRequest('/prism/create',{
        name: 'test',
        domain: 'localdomain',
        site: 'localsite',
        zone: 'localzone',
        host: 'localhost',
        ip: '127.0.0.1',
        port: 3002
      })
        .spread(function(res,body){
          if(body.error) throw new Error(body.error)
          return P.all([
            expect(res.statusCode).to.equal(200),
            expect(body.success).to.equal('Store instance created'),
            expect(body.id).to.be.greaterThan(0)
          ])
        })
    })
    after(function(){
      return makeRequest('/prism/remove',{name: 'test'})
        .spread(function(res,body){
          if(body.error) throw new Error(body.error)
          return P.all([
            expect(res.statusCode).to.equal(200),
            expect(body.success).to.equal('Store instance removed')
          ])
        })
    })
    it('should create',function(){
      return makeRequest('/store/create',{
        prism: 'test',
        name: 'test',
        ip: '127.0.0.1',
        port: 3003
      })
        .spread(function(res,body){
          if(body.error) throw new Error(body.error)
          return P.all([
            expect(res.statusCode).to.equal(200),
            expect(body.success).to.equal('Store instance created'),
            expect(body.id).to.be.greaterThan(0)
          ])
        })
    })
    it('should list all',function(){
      return makeRequest('/store/list')
        .spread(function(res,body){
          if(body.error) throw new Error(body.error)
          return P.all([
            expect(res.statusCode).to.equal(200),
            expect(body.store).to.be.an('Array'),
            expect(body.store.length).to.be.greaterThan(0)
          ])
        })
    })
    it('should list for a prism',function(){
      return makeRequest('/store/list',{prism: 'test'})
        .spread(function(res,body){
          if(body.error) throw new Error(body.error)
          return P.all([
            expect(res.statusCode).to.equal(200),
            expect(body.store).to.be.an('Array'),
            expect(body.store.length).to.be.greaterThan(0)
          ])
        })
    })
    it('should update',function(){
      return makeRequest('/store/update',{
        name: 'test',
        port: 3004
      })
        .spread(function(res,body){
          if(body.error) throw new Error(body.error)
          return P.all([
            expect(res.statusCode).to.equal(200),
            expect(body.success).to.equal('Store instance updated')
          ])
        })
    })
    it('should find',function(){
      return makeRequest('/store/find',{name: 'test'})
        .spread(function(res,body){
          if(body.error) throw new Error(body.error)
          return P.all([
            expect(res.statusCode).to.equal(200),
            expect(body.name).to.equal('test'),
            expect(body.port).to.equal(3004)
          ])
        })
    })
    it('should remove',function(){
      return makeRequest('/store/remove',{name: 'test'})
        .spread(function(res,body){
          if(body.error) throw new Error(body.error)
          return P.all([
            expect(res.statusCode).to.equal(200),
            expect(body.success).to.equal('Store instance removed'),
            expect(body.count).to.equal(1)
          ])
        })
    })
  })
  //memory
  describe('memory',function(){
    it('should create',function(){
      return makeRequest('/memory/create',{
        name: 'test',
        value: 'foo'
      })
        .spread(function(res,body){
          if(body.error) throw new Error(body.error)
          return P.all([
            expect(res.statusCode).to.equal(200),
            expect(body.success).to.equal('Object created'),
            expect(body.id).to.be.greaterThan(0)
          ])
        })
    })
    it('should exist',function(){
      return makeRequest('/memory/exists',{name: 'test'})
        .spread(function(res,body){
          if(body.error) throw new Error(body.error)
          return P.all([
            expect(res.statusCode).to.equal(200),
            expect(body.exists).to.equal(true)
          ])
        })
    })
    it('should update',function(){
      return makeRequest('/memory/update',{
          name: 'test',
          value: 'foo2'}
      )
        .spread(function(res,body){
          if(body.error) throw new Error(body.error)
          return P.all([
            expect(res.statusCode).to.equal(200),
            expect(body.success).to.equal('Object updated')
          ])
        })
    })
    it('should find',function(){
      return makeRequest('/memory/find',{name: 'test'})
        .spread(function(res,body){
          if(body.error) throw new Error(body.error)
          return P.all([
            expect(res.statusCode).to.equal(200),
            expect(body.name).to.equal('test'),
            expect(body.value).to.equal('foo2')
          ])
        })
    })
    it('should remove',function(){
      return makeRequest('/memory/remove',{name: 'test'})
        .spread(function(res,body){
          if(body.error) throw new Error(body.error)
          return P.all([
            expect(res.statusCode).to.equal(200),
            expect(body.success).to.equal('Object removed'),
            expect(body.count).to.equal(1)
          ])
        })
    })
  })
})
