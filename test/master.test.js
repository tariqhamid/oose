'use strict';
var P = require('bluebird')
var expect = require('chai').expect
var infant = require('infant')
var request = require('request')

var config = require('../config')

var baseUrl = 'http://' +
  (config.master.host || 'localhost') +
  ':' + config.master.port

//make some promises
P.promisifyAll(infant)
P.promisifyAll(request)

describe('master',function(){
  var master = infant.parent('../master')
  before(function(){
    return master.startAsync()
  })
  after(function(){
    return master.stopAsync()
  })
  it('should have a homepage',function(){
    return request.getAsync(baseUrl,{json: true})
      .spread(function(res,body){
        return P.all([
          expect(res.statusCode).to.equal(200),
          expect(body.message).to.equal('Welcome to OOSE version ' +
            config.version)
        ])
      })
  })
  it('should allow creation of a prism',function(){
    return request.postAsync(
      baseUrl + '/prism/create',
      {
        json: {
          name: 'localinstance',
          domain: 'localdomain',
          site: 'localsite',
          zone: 'localzone',
          host: 'localhost',
          ip: '127.0.0.1',
          port: 3002
        }
      }
    )
      .spread(function(res,body){
        if(body.error) throw new Error(body.error)
        return P.all([
          expect(res.statusCode).to.equal(200),
          expect(body.success).to.equal('Prism instance created')
        ])
      })
  })
  it('should give a list of prisms',function(){
    return request.postAsync(baseUrl + '/prism/list',{json: true})
      .spread(function(res,body){
        if(body.error) throw new Error(body.error)
        return P.all([
          expect(res.statusCode).to.equal(200),
          expect(body.prisms).to.be.an('Array')
        ])
      })
  })
  it('should allow deletion of a prism',function(){
    return request.postAsync(baseUrl + '/prism/remove',{
      json: {
        name: 'localinstance'
      }
    })
      .spread(function(res,body){
        if(body.error) throw new Error(body.error)
        return P.all([
          expect(res.statusCode).to.equal(200),
          expect(body.success).to.equal('Prism instance removed')
        ])
      })
  })
})
