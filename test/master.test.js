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
  it('should allow creation of a prism',function(){
    return makeRequest('/prism/create',{
      name: 'localinstance',
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
          expect(body.success).to.equal('Prism instance created')
        ])
      })
  })
  it('should give a list of prisms',function(){
    return makeRequest('/prism/list')
      .spread(function(res,body){
        if(body.error) throw new Error(body.error)
        return P.all([
          expect(res.statusCode).to.equal(200),
          expect(body.prisms).to.be.an('Array')
        ])
      })
  })
  it('should allow deletion of a prism',function(){
    return makeRequest('/prism/remove',{name: 'localinstance'})
      .spread(function(res,body){
        if(body.error) throw new Error(body.error)
        return P.all([
          expect(res.statusCode).to.equal(200),
          expect(body.success).to.equal('Prism instance removed')
        ])
      })
  })
})
