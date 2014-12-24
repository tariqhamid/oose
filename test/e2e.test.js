'use strict';
//load promises separately here
var P = require('bluebird')
//P.longStackTraces() //turn of for easier debugging


/**
 * API Timeout for outage testing
 * @type {number}
 */
process.env.REQUEST_TIMEOUT = 10000

//regular deps
var expect = require('chai').expect
var fs = require('graceful-fs')
var infant = require('infant')
var ObjectManage = require('object-manage')
var request = require('request')
var url = require('url')

var api = require('../helpers/api')
var content = require('./helpers/content')
var NetworkError = require('../helpers/NetworkError')
var UserError = require('../helpers/UserError')

var config = require('../config')
var purchase

var user = {
  session: {},
  username: 'test',
  password: ''
}


//make some promises
P.promisifyAll(infant)
P.promisifyAll(request)


/**
 * Make env for instance with config override
 * @param {string} configFile
 * @return {object}
 */
var makeEnv = function(configFile){
  var env = new ObjectManage()
  env.$load(process.env)
  env.OOSE_CONFIG = configFile
  return env.$strip()
}


/**
 * Get an instance config
 * @param {string} configFile
 * @return {object}
 */
var getConfig = function(configFile){
  var conf = new ObjectManage()
  conf.$load(config.$strip())
  conf.$load(require(configFile))
  return conf.$strip()
}


/**
 * Cluster configuration
 * @type {object}
 */
var clconf = {
  master: getConfig(__dirname + '/assets/master.config.js'),
  prism1: getConfig(__dirname + '/assets/prism1.config.js'),
  prism2: getConfig(__dirname + '/assets/prism2.config.js'),
  store1: getConfig(__dirname + '/assets/store1.config.js'),
  store2: getConfig(__dirname + '/assets/store2.config.js'),
  store3: getConfig(__dirname + '/assets/store3.config.js'),
  store4: getConfig(__dirname + '/assets/store4.config.js')
}


/**
 * Override master
 * @type {request}
 */

var master = api.master(clconf.master.master)

//setup our mock cluster
var masterServer = infant.parent('../master',{
  fork: { env: makeEnv(__dirname + '/assets/master.config.js') }
})
//var prismServer1 = infant.parent('../prism')
var prismServer1 = infant.parent('../prism',{
  fork: { env: makeEnv(__dirname + '/assets/prism1.config.js') }
})
var prismServer2 = infant.parent('../prism',{
  fork: { env: makeEnv(__dirname + '/assets/prism2.config.js') }
})
var storeServer1 = infant.parent('../store',{
  fork: { env: makeEnv(__dirname + '/assets/store1.config.js') }
})
var storeServer2 = infant.parent('../store',{
  fork: { env: makeEnv(__dirname + '/assets/store2.config.js') }
})
var storeServer3 = infant.parent('../store',{
  fork: { env: makeEnv(__dirname + '/assets/store3.config.js') }
})
var storeServer4 = infant.parent('../store',{
  fork: { env: makeEnv(__dirname + '/assets/store4.config.js') }
})

//lets make sure these processes are killed
process.on('exit',function(){
  masterServer.kill()
  prismServer1.kill()
  prismServer2.kill()
  storeServer1.kill()
  storeServer2.kill()
  storeServer3.kill()
  storeServer4.kill()
})

//reusable tests
var checkUp = function(client){
  return function(){
    return client.postAsync(client.url('/ping'))
      .spread(function(res,body){
        expect(body.pong).to.equal('pong')
      })
  }
}

var checkDown = function(client){
  return function(){
    return client.postAsync(client.url('/ping'))
      .then(function(){
        throw new Error('Server not down')
      })
      .catch(Error,client.handleNetworkError)
      .catch(NetworkError,function(err){
        expect(err.message).to.match(/ECONNREFUSED|ETIMEDOUT/)
      })
  }
}

var contentUpload = function(prism){
  return function(){
    var client = api.setSession(user.session,api.prism(prism.prism))
    return client
      .postAsync({
        url: client.url('/content/upload'),
        formData: {
          file: fs.createReadStream(content.file)
        },
        localAddress: '127.0.0.1'
      })
      .spread(function(res,body){
        console.log(body)
        expect(body.files.file.sha1).to.equal(content.sha1)
      })
  }
}

var contentExists = function(prism,options){
  if('object' !== typeof options) options = {}
  if(!options.hasOwnProperty('count')) options.count = 2
  if(!options.hasOwnProperty('checkExists')) options.checkExists = true
  if(!options.hasOwnProperty('deepChecks'))
    options.deepChecks = ['prism1','prism2']
  return function(){
    var client = api.prism(prism.prism)
    return client
      .postAsync({
        url: client.url('/content/exists'),
        json: {sha1: content.sha1},
        localAddress: '127.0.0.1'
      })
      .spread(function(res,body){
        expect(body.sha1).to.equal(content.sha1)
        if(options.checkExists) expect(body.exists).to.equal(true)
        if(options.countGreaterEqual)
          expect(body.count).to.be.least(options.count)
        else if(options.checkExists)
          expect(body.count).to.equal(options.count)
        if(options.deepChecks.indexOf('prism1') !== -1){
          expect(body.map.prism1).to.be.an('object')
          expect(body.map.prism1.exists).to.equal(true)
          expect(Object.keys(body.map.prism1).length).to.equal(3)
        }
        if(options.deepChecks.indexOf('prism2') !== -1){
          expect(body.map.prism2).to.be.an('object')
          expect(body.map.prism2.exists).to.equal(true)
          expect(Object.keys(body.map.prism1).length).to.equal(3)
        }
      })
  }
}

var contentExistsInvalidate = function(prism){
  return function(){
    var client = api.prism(prism.prism)
    return client.postAsync({
      url: client.url('/content/exists/invalidate'),
      json: {sha1: content.sha1}
    })
      .spread(function(res,body){
        expect(body.success).to.equal('Existence cache cleared')
        expect(body.sha1).to.equal(content.sha1)
      })
  }
}

var contentPurchase = function(prism){
  return function(){
    var client = api.setSession(user.session,api.prism(prism.prism))
    return client
      .postAsync({
        url: client.url('/content/purchase'),
        json: {
          sha1: content.sha1,
          ip: '127.0.0.1',
          referrer: ['localhost']
        }
      })
      .spread(function(res,body){
        expect(body.token.length).to.equal(64)
        expect(body.ext).to.equal('txt')
        expect(body.life).to.equal(21600)
        expect(body.sha1).to.equal(content.sha1)
        expect(body.referrer).to.be.an('array')
        expect(body.referrer[0]).to.equal('localhost')
        purchase = body
      })
  }
}

var contentDeliver = function(prism){
  return function(){
    var client = api.prism(prism.prism)
    var options = {
      url: client.url('/' + purchase.token + '/' + content.filename),
      headers: {
        'Referer': 'localhost'
      },
      followRedirect: false,
      localAddress: '127.0.0.1'
    }
    return client.getAsync(options)
      .spread(function(res){
        expect(res.statusCode).to.equal(302)
        var uri = url.parse(res.headers.location)
        var host = uri.host.split('.')
        expect(host[0]).to.match(/^store\d{1}$/)
        expect(host[1]).to.equal(prism.domain)
        expect(uri.pathname).to.equal(
          '/' + purchase.token + '/' + content.filename)
      })
  }
}

var contentDownload = function(prism){
  return function(){
    var client = api.setSession(user.session,api.prism(prism.prism))
    return client.postAsync({
      url: client.url('/content/download'),
      json: {sha1: content.sha1}
    })
      .spread(function(res,body){
        expect(body).to.equal(content.data)
      })
  }
}



describe('e2e',function(){
  describe('e2e:prism',function(){
    //spin up an entire cluster here
    this.timeout(3000)
    //start servers and create a user
    before(function(){
      var that = this
      that.timeout(20000)
      console.log('Starting mock cluster....')
      return masterServer.startAsync()
        .then(function(){
          //create user
          return master.postAsync({
            url: master.url('/user/create'),
            json: {username: user.username}
          })
        })
        .spread(function(res,body){
          user.password = body.password
          expect(body.success).to.equal('User created')
          expect(body.id).to.be.greaterThan(0)
          expect(body.password.length).to.equal(64)
          //create prisms
          var promises = []
          var prisms = ['prism1','prism2']
          var prism
          for(var i = 0; i < prisms.length; i++){
            prism = clconf[prisms[i]]
            promises.push(
              master.postAsync({
                url: master.url('/prism/create'),
                json: {
                  name: prism.prism.name,
                  domain: prism.domain,
                  site: prism.site,
                  zone: prism.zone,
                  host: prism.prism.host,
                  port: prism.prism.port
                }
              })
            )
          }
          return P.all(promises)
        })
        .then(function(){
          //create stores
          var promises = []
          var stores = ['store1','store2','store3','store4']
          var store
          for(var i = 0; i < stores.length; i++){
            store = clconf[stores[i]]
            promises.push(master.postAsync({
              url: master.url('/store/create'),
              json: {
                prism: store.prism.name,
                name: store.store.name,
                host: store.store.host,
                port: store.store.port
              }
            }))
          }
          return P.all(promises)
        })
        .then(function(){
          return P.all([
            prismServer1.startAsync(),
            prismServer2.startAsync(),
            storeServer1.startAsync(),
            storeServer2.startAsync(),
            storeServer3.startAsync(),
            storeServer4.startAsync()
          ])
        })
        .then(function(){
          console.log('Mock cluster started!')
        })
        .catch(function(err){
          console.trace(err)
        })
    })
    //remove user and stop services
    after(function(){
      console.log('Stopping mock cluster...')
      return P.try(function(){
        //remove stores
        var promises = []
        var stores = ['store1','store2','store3','store4']
        for(var i = 0; i < stores.length; i++){
          promises.push(
            master.postAsync({
              url: master.url('/store/remove'),
              json: {name: stores[i]}
            })
          )
        }
        return P.all(promises)
      })
        .then(function(){
          //remove prisms
          var promises = []
          var prisms = ['prism1','prism2']
          for(var i = 0; i < prisms.length; i++){
            promises.push(
              master.postAsync({
                url: master.url('/prism/remove'),
                json: {name: prisms[i]}
              })
            )
          }
          return P.all(promises)
        })
        .then(function(){
          //remove user
          return master.postAsync({
            url: master.url('/user/remove'),
            json: {username: user.username}
          })
        })
        .spread(function(res,body){
          return P.all([
            expect(body.success).to.equal('User removed'),
            expect(body.count).to.equal(1)
          ])
        })
        .then(function(){
          return P.all([
            storeServer4.stopAsync(),
            storeServer3.stopAsync(),
            storeServer2.stopAsync(),
            storeServer1.stopAsync(),
            prismServer2.stopAsync(),
            prismServer1.stopAsync(),
            masterServer.stopAsync()
          ])
        })
        .then(function(){
          console.log('Mock cluster stopped!')
        })
        .catch(function(err){
          console.trace(err)
        })
    })
    it('master should be up',checkUp(master))
    it('prism1 should be up',checkUp(api.prism(clconf.prism1.prism)))
    it('prism2 should be up',checkUp(api.prism(clconf.prism2.prism)))
    it('store1 should be up',checkUp(api.store(clconf.store1.store)))
    it('store2 should be up',checkUp(api.store(clconf.store2.store)))
    it('store3 should be up',checkUp(api.store(clconf.store3.store)))
    it('store4 should be up',checkUp(api.store(clconf.store4.store)))
    it('should not require authentication for public functions',function(){
      var prism = clconf.prism1.prism
      var client = api.prism(prism)
      return client
        .postAsync(client.url('/'))
        .spread(client.validateResponse())
        .spread(function(res,body){
          expect(body.message).to.equal(
            'Welcome to OOSE version ' + config.version)
          return client.postAsync(client.url('/ping'))
        })
        .spread(client.validateResponse())
        .spread(function(res,body){
          expect(body.pong).to.equal('pong')
          return client.postAsync(client.url('/user/login'))
        })
        .spread(client.validateResponse())
        .spread(function(res,body){
          console.log(body)
          throw new Error('Should have thrown an error for no username')
        })
        .catch(UserError,function(err){
          expect(err.message).to.equal('No user found')
        })
    })
    it('should require a session for all protected prism functions',function(){
      var client = api.prism(clconf.prism1.prism)
      return client.postAsync(client.url('/user/logout'))
        .catch(UserError,function(err){
          expect(err.message).to.match(/Invalid response code \(401\) to POST/)
          return client.postAsync(client.url('/user/password/reset'))
        })
        .catch(UserError,function(err){
          expect(err.message).to.match(/Invalid response code \(401\) to POST/)
          return client.postAsync(client.url('/user/session/validate'))
        })
        .catch(UserError,function(err){
          expect(err.message).to.match(/Invalid response code \(401\) to POST/)
          return client.postAsync(client.url('/content/upload'))
        })
        .catch(UserError,function(err){
          expect(err.message).to.match(/Invalid response code \(401\) to POST/)
          return client.postAsync(client.url('/content/purchase'))
        })
        .catch(UserError,function(err){
          expect(err.message).to.match(/Invalid response code \(401\) to POST/)
          return client.postAsync(client.url('/content/remove'))
        })
        .catch(UserError,function(err){
          expect(err.message).to.match(/Invalid response code \(401\) to POST/)
        })
    })
    it('should login to prism1',function(){
      var client = api.prism(clconf.prism1.prism)
      return client.postAsync({
        url: client.url('/user/login'),
        json: {
          username: user.username,
          password: user.password
        }
      })
        .spread(function(res,body){
          expect(body.session).to.be.an('object')
          user.session = body.session
        })
    })
    it('should login to prism2',function(){
      var client = api.prism(clconf.prism2.prism)
      return client.postAsync({
        url: client.url('/user/login'),
        json: {
          username: user.username,
          password: user.password
        }
      })
        .spread(function(res,body){
          expect(body.session).to.be.an('object')
          client = api.setSession(body.session,client)
          return client.postAsync(client.url('/user/logout'))
        })
        .spread(function(res,body){
          expect(body.success).to.equal('User logged out')
        })
    })

    it('should upload content',contentUpload(clconf.prism1))

    it('should show the content exists in 2 places',
      contentExists(clconf.prism1))

    it('should invalidate the content existence',
      contentExistsInvalidate(clconf.prism1))

    it('should allow API download of the content',
      contentDownload(clconf.prism1))

    it('should allow purchase of the content',
      contentPurchase(clconf.prism1))

    it('should accept a purchased URL and deliver content on prism1',
      contentDeliver(clconf.prism1))

    it('should accept a purchased URL and deliver content on prism2',
      contentDeliver(clconf.prism2))

    it('should deny a request from a bad ip',function(){
      var client = api.prism(clconf.prism2.prism)
      var options = {
        url: client.url('/' + purchase.token + '/' + content.filename),
        followRedirect: false,
        localAddress: '127.0.0.2'
      }
      return client.getAsync(options)
        .spread(function(res,body){
          expect(res.statusCode).to.equal(500)
          expect(body.error).to.equal('Invalid request')
        })
    })
    it('should deny a request from a bad referrer',function(){
      var client = api.prism(clconf.prism2.prism)
      var options = {
        url: client.url('/' + purchase.token + '/' + content.filename),
        headers: {
          Referer: 'foo'
        },
        followRedirect: false,
        localAddress: '127.0.0.1'
      }
      return client.getAsync(options)
        .spread(function(res,body){
          expect(res.statusCode).to.equal(500)
          expect(body.error).to.equal('Invalid request')
        })
    })
    it('should allow removal of purchases',function(){
      var client = api.setSession(user.session,api.prism(clconf.prism2.prism))
      return client.postAsync({
        url: client.url('/content/remove'),
        json: {token: purchase.token}
      })
        .spread(function(res,body){
          expect(body.token).to.equal(purchase.token)
          expect(body.count).to.equal(1)
          expect(body.success).to.equal('Purchase removed')
        })
    })
    describe('outage tests',function(){
      describe('master down',function(){
        before(function(){
          return contentUpload(clconf.prism1)()
            .then(function(){
              return masterServer.stopAsync()
            })
        })
        after(function(){
          return masterServer.startAsync()
        })
        it('master should be down',checkDown(master))
        it('should still upload content',contentUpload(clconf.prism1))
        it('should still show existence',contentExists(clconf.prism1))
        it('should invalidate the content existence',
          contentExistsInvalidate(clconf.prism1))
        it('should still purchase content',contentPurchase(clconf.prism1))
        it('should still deliver content',contentDeliver(clconf.prism1))
        it('should still download content',contentDownload(clconf.prism1))
      })
      describe('prism2 down',function(){
        before(function(){
          return prismServer2.stopAsync()
        })
        after(function(){
          return prismServer2.startAsync()
        })
        it('prism2 should be down',checkDown(api.prism(clconf.prism2.prism)))
        it('should still upload content',contentUpload(clconf.prism1))
        it('should still show existence',
          contentExists(clconf.prism1,{count: 1,deepChecks: ['prism1']}))
        it('should invalidate the content existence',
          contentExistsInvalidate(clconf.prism1))
        it('should still purchase content',contentPurchase(clconf.prism1))
        it('should still deliver content',contentDeliver(clconf.prism1))
        it('should still download content',contentDownload(clconf.prism1))
      })
      describe('prism1 down',function(){
        before(function(){
          return prismServer1.stopAsync()
        })
        after(function(){
          return prismServer1.startAsync()
        })
        it('prism1 should be down',checkDown(api.prism(clconf.prism1.prism)))
        it('should still upload content',contentUpload(clconf.prism2))
        it('should still show existence',
          contentExists(clconf.prism2,{count: 1,deepChecks: ['prism2']}))
        it('should invalidate the content existence',
          contentExistsInvalidate(clconf.prism2))
        it('should still purchase content',contentPurchase(clconf.prism2))
        it('should still deliver content',contentDeliver(clconf.prism2))
        it('should still download content',contentDownload(clconf.prism2))
      })
      describe('store1 and store2 down',function(){
        before(function(){
          return P.all([
            storeServer1.stopAsync(),
            storeServer2.stopAsync()
          ])
        })
        after(function(){
          return P.all([
            storeServer1.startAsync(),
            storeServer2.startAsync()
          ])
        })
        it('store1 should be down',checkDown(api.store(clconf.store1.store)))
        it('store2 should be down',checkDown(api.store(clconf.store2.store)))
        it('should still upload content',contentUpload(clconf.prism1))
        it('should still show existence',
          contentExists(clconf.prism1,{
            checkExists: true,
            count: 1,
            countGreaterEqual: true,
            deepChecks: ['prism2']
          })
        )
        it('should invalidate the content existence',
          contentExistsInvalidate(clconf.prism1))
        it('should still purchase content',contentPurchase(clconf.prism1))
        it('should still deliver content',contentDeliver(clconf.prism1))
        it('should still download content',contentDownload(clconf.prism1))
      })
      describe('store3 and store4 down',function(){
        before(function(){
          return P.all([
            storeServer3.stopAsync(),
            storeServer4.stopAsync()
          ])
        })
        after(function(){
          return P.all([
            storeServer3.startAsync(),
            storeServer4.startAsync()
          ])
        })
        it('store3 should be down',checkDown(api.store(clconf.store3.store)))
        it('store4 should be down',checkDown(api.store(clconf.store4.store)))
        it('should still upload content',contentUpload(clconf.prism2))
        it('should still show existence',
          contentExists(clconf.prism1,{
            checkExists: true,
            count: 1,
            countGreaterEqual: true,
            deepChecks: ['prism1']
          })
        )
        it('should invalidate the content existence',
          contentExistsInvalidate(clconf.prism1))
        it('should still purchase content',contentPurchase(clconf.prism2))
        it('should still deliver content',contentDeliver(clconf.prism2))
        it('should still download content',contentDownload(clconf.prism2))
      })
      describe('prism1, store1 and store2 down',function(){
        before(function(){
          return P.all([
            prismServer1.stopAsync(),
            storeServer1.stopAsync(),
            storeServer2.stopAsync()
          ])
        })
        after(function(){
          var that = this
          that.timeout(5000)
          return P.all([
            storeServer1.startAsync(),
            storeServer2.startAsync(),
            prismServer1.startAsync()
          ])
        })
        it('prism1 should be down',checkDown(api.prism(clconf.prism1.prism)))
        it('store1 should be down',checkDown(api.store(clconf.store1.store)))
        it('store2 should be down',checkDown(api.store(clconf.store2.store)))
        it('should still upload content',contentUpload(clconf.prism2))
        it('should still show existence',
          contentExists(clconf.prism2,{
            checkExists: true,
            count: 1,
            countGreaterEqual: true,
            deepChecks: ['prism2']
          })
        )
        it('should invalidate the content existence',
          contentExistsInvalidate(clconf.prism2))
        it('should still purchase content',contentPurchase(clconf.prism2))
        it('should still deliver content',contentDeliver(clconf.prism2))
        it('should still download content',contentDownload(clconf.prism2))
      })
      describe('prism2, store3 and store4 down',function(){
        before(function(){
          return P.all([
            prismServer2.stopAsync(),
            storeServer3.stopAsync(),
            storeServer4.stopAsync()
          ])
        })
        after(function(){
          var that = this
          that.timeout(5000)
          return P.all([
            storeServer3.startAsync(),
            storeServer4.startAsync(),
            prismServer2.startAsync()
          ])
        })
        it('prism2 should be down',checkDown(api.prism(clconf.prism2.prism)))
        it('store3 should be down',checkDown(api.store(clconf.store3.store)))
        it('store4 should be down',checkDown(api.store(clconf.store4.store)))
        it('should still upload content',contentUpload(clconf.prism1))
        it('should still show existence',
          contentExists(clconf.prism1,{
            checkExists: true,
            count: 1,
            countGreaterEqual: true,
            deepChecks: ['prism1']
          })
        )
        it('should invalidate the content existence',
          contentExistsInvalidate(clconf.prism1))
        it('should still purchase content',contentPurchase(clconf.prism1))
        it('should still deliver content',contentDeliver(clconf.prism1))
        it('should still download content',contentDownload(clconf.prism1))
      })
    })
  })
})
