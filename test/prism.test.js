'use strict';
var P = require('bluebird')
var expect = require('chai').expect
var infant = require('infant')
var request = require('request')

var config = require('../config')

//make some promises
P.promisifyAll(infant)
P.promisifyAll(request)


/**
 * Store user info for testing
 * @type {object}
 */
var user = {
  session: {},
  username: 'test',
  password: ''
}

var baseUrl = 'http://' +
  (config.prism.host || 'localhost') +
  ':' + config.prism.port


/**
 * Make a request to the master
 * @param {string} uri
 * @param {object} data
 * @return {P}
 */
var makeMasterRequest = function(uri,data){
  var baseUrl = 'http://' +
    (config.master.host || 'localhost') +
    ':' + config.master.port
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


/**
 * Make a request to prism
 * @param {string} uri
 * @param {object} data
 * @return {P}
 */
var makeRequest = function(uri,data){
  uri = baseUrl + (uri || '/')
  if(user.session && user.session.token) data.token = user.session.token
  return request.postAsync(
    uri,
    {
      json: data || {}
    }
  )
}

describe('prism',function(){
  this.timeout(5000)
  var master = infant.parent('../master')
  var prism = infant.parent('../prism')
  //start servers and create a user
  before(function(){
    return P.all([
      master.startAsync(),
      prism.startAsync()
    ])
      .then(function(){
        //create user
        return makeMasterRequest('/user/create',{
          username: user.username
        })
          .spread(function(res,body){
            if(body.error) throw new Error(body.error)
            user.password = body.password
            return P.all([
              expect(res.statusCode).to.equal(200),
              expect(body.success).to.equal('User created'),
              expect(body.id).to.be.greaterThan(0),
              expect(body.password.length).to.equal(64)
            ])
          })
      })
  })
  //remove user and stop services
  after(function(){
    makeMasterRequest('/user/remove',{username: user.username})
      .spread(function(res,body){
        if(body.error) throw new Error(body.error)
        return P.all([
          expect(res.statusCode).to.equal(200),
          expect(body.success).to.equal('User removed'),
          expect(body.count).to.equal(1)
        ])
      })
      .then(function(){
        return P.all([
          prism.stopAsync(),
          master.stopAsync()
        ])
      })
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
  //login
  it.only('should login',function(){
    return makeRequest('/login',{user: user.username, password: user.password})
      .spread(function(res,body){
        if(body.error) throw new Error(body.error)
        if(!body.session) throw new Error('No session created')
        user.session = body.session
        return P.all([
          expect(res.statusCode).to.equal(200),
          expect(body.success).to.equal('User logged in'),
          expect(body.session).to.be.an('Object')
        ])
      })
  })
})
