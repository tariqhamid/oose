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

//setup bridge to master
var master = new APIClient(config.master.port,config.master.host)
master.setBasicAuth(config.master.username,config.master.password)


/**
 * Store user info for testing
 * @type {object}
 */
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
        return master.post('/user/create',{username: user.username})
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
    return master.post('/user/remove',{username: user.username})
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
    client = new APIClient(config.prism.port,config.prism.host)
  })
  //home page
  it('should have a homepage',function(){
    return client
      .post('/')
      .spread(function(res,body){
        return P.all([
          expect(body.message).to.equal('Welcome to OOSE version ' +
          config.version)
        ])
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
      client.setSession(user.session)
      return client
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
      client.setSession(user.session)
      return client
        .post('/user/session/validate')
        .spread(function(res,body){
          return P.all([
            expect(body.success).to.equal('Session valid')
          ])
        })
    })
    it('should allow a session update',function(){
      client.setSession(user.session)
      return client
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
      client.setSession(user.session)
      return client
        .post('/user/logout')
        .spread(function(res,body){
          return P.all([
            expect(body.success).to.equal('User logged out')
          ])
        })
    })
  })
})
