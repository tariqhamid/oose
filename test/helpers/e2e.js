'use strict';
var expect = require('chai').expect
var fs = require('graceful-fs')
var infant = require('infant')
var ObjectManage = require('object-manage')
var oose = require('oose-sdk')
var path = require('path')
var url = require('url')

var api = require('../../helpers/api')
var content = oose.mock.content
var NetworkError = oose.NetworkError
var UserError = oose.UserError

var config = require('../../config')

//load promises here
var P = require('bluebird')
//P.longStackTraces() //enable long stack traces for debugging only

//make some promises
P.promisifyAll(infant)
var rimraf = P.promisify(require('rimraf'))

//lets make sure these processes are killed
process.on('exit',function(){
  var keys = Object.keys(exports.server)
  var key
  var server
  for(var i = 0; i < keys.length; i++){
    key = keys[i]
    server = exports.server[key]
    server.kill()
  }
})


/**
 * API Timeout for outage testing
 * @type {number}
 */
process.env.REQUEST_TIMEOUT = 10000


/**
 * User session storage
 * @type {object}
 */
exports.user = {
  session: {},
  username: 'test',
  password: ''
}


/**
 * Purchase storagte
 * @type {object}
 */
exports.purchase = {}


/**
 * Make env for instance with config override
 * @param {string} configFile
 * @return {object}
 */
exports.makeEnv = function(configFile){
  var env = new ObjectManage()
  env.$load(process.env)
  env.OOSE_CONFIG = path.resolve(configFile)
  return env.$strip()
}


/**
 * Get an instance config
 * @param {string} configFile
 * @return {object}
 */
exports.getConfig = function(configFile){
  var conf = new ObjectManage()
  conf.$load(config.$strip())
  conf.$load(require(path.resolve(configFile)))
  return conf.$strip()
}


/**
 * Cluster configuration
 * @type {object}
 */
exports.clconf = {
  master: exports.getConfig(__dirname + '/../assets/master.config.js'),
  prism1: exports.getConfig(__dirname + '/../assets/prism1.config.js'),
  prism2: exports.getConfig(__dirname + '/../assets/prism2.config.js'),
  store1: exports.getConfig(__dirname + '/../assets/store1.config.js'),
  store2: exports.getConfig(__dirname + '/../assets/store2.config.js'),
  store3: exports.getConfig(__dirname + '/../assets/store3.config.js'),
  store4: exports.getConfig(__dirname + '/../assets/store4.config.js')
}


/**
 * Override master
 * @type {request}
 */
exports.master = api.master(exports.clconf.master.master)


/**
 * Mock servers
 * @type {object}
 */
exports.server = {
  master: infant.parent('../../master',{
    fork: {env: exports.makeEnv(__dirname + '/../assets/master.config.js')}
  }),
  prism1: infant.parent('../../prism',{
    fork: {env: exports.makeEnv(__dirname + '/../assets/prism1.config.js')}
  }),
  prism2: infant.parent('../../prism',{
    fork: {env: exports.makeEnv(__dirname + '/../assets/prism2.config.js')}
  }),
  store1: infant.parent('../../store',{
    fork: {env: exports.makeEnv(__dirname + '/../assets/store1.config.js')}
  }),
  store2: infant.parent('../../store',{
    fork: {env: exports.makeEnv(__dirname + '/../assets/store2.config.js')}
  }),
  store3: infant.parent('../../store',{
    fork: {env: exports.makeEnv(__dirname + '/../assets/store3.config.js')}
  }),
  store4: infant.parent('../../store',{
    fork: {env: exports.makeEnv(__dirname + '/../assets/store4.config.js')}
  })
}


/**
 * Start cluster
 * @param {object} that
 * @return {P}
 */
exports.before = function(that){
  that.timeout(80000)
  console.log('Starting mock cluster....')
  return rimraf(__dirname + '/../assets/data')
    .then(function(){
      return exports.server.master.startAsync()
    })
    .then(function(){
      //remove the user in case it was left over after a botched test
      return exports.master.postAsync({
        url: exports.master.url('/user/remove'),
        json: {username: exports.user.username}
      })
    })
    .then(function(){
      //create user
      return exports.master.postAsync({
        url: exports.master.url('/user/create'),
        json: {username: exports.user.username}
      })
    })
    .spread(function(res,body){
      exports.user.password = body.password
      expect(body.success).to.equal('User created')
      expect(body.id).to.be.greaterThan(0)
      expect(body.password.length).to.equal(64)
      //create prisms
      var promises = []
      var prisms = ['prism1','prism2']
      var prism
      for(var i = 0; i < prisms.length; i++){
        prism = exports.clconf[prisms[i]]
        promises.push(
          exports.master.postAsync({
            url: exports.master.url('/prism/create'),
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
        store = exports.clconf[stores[i]]
        promises.push(exports.master.postAsync({
          url: exports.master.url('/store/create'),
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
        exports.server.prism1.startAsync(),
        exports.server.prism2.startAsync(),
        exports.server.store1.startAsync(),
        exports.server.store2.startAsync(),
        exports.server.store3.startAsync(),
        exports.server.store4.startAsync()
      ])
    })
    .then(function(){
      console.log('Mock cluster started!')
    })
}


/**
 * Shut down mock cluster
 * @param {object} that
 * @return {P}
 */
exports.after = function(that){
  that.timeout(10000)
  console.log('Stopping mock cluster...')
  return P.try(function(){
    //remove stores
    var promises = []
    var stores = ['store1','store2','store3','store4']
    for(var i = 0; i < stores.length; i++){
      promises.push(
        exports.master.postAsync({
          url: exports.master.url('/store/remove'),
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
          exports.master.postAsync({
            url: exports.master.url('/prism/remove'),
            json: {name: prisms[i]}
          })
        )
      }
      return P.all(promises)
    })
    .then(function(){
      //remove user
      return exports.master.postAsync({
        url: exports.master.url('/user/remove'),
        json: {username: exports.user.username}
      })
    })
    .spread(function(res,body){
      expect(body.success).to.equal('User removed')
      expect(body.count).to.equal(1)
      return P.all([
        exports.server.store4.stopAsync(),
        exports.server.store3.stopAsync(),
        exports.server.store2.stopAsync(),
        exports.server.store1.stopAsync(),
        exports.server.prism2.stopAsync(),
        exports.server.prism1.stopAsync(),
        exports.server.master.stopAsync()
      ])
    })
    .then(function(){
      console.log('Mock cluster stopped!')
    })
}


/**
 * Check if a host is up
 * @param {string} type
 * @param {object} server
 * @return {Function}
 */
exports.checkUp = function(type,server){
  return function(){
    var client = api[type](server[type])
    return client.postAsync({url: client.url('/ping'), timeout: 50})
      .spread(function(res,body){
        expect(body.pong).to.equal('pong')
      })
  }
}


/**
 * Check if a host is down
 * @param {string} type
 * @param {object} server
 * @return {Function}
 */
exports.checkDown = function(type,server){
  return function(){
    var client = api[type](server[type])
    return client.postAsync({url: client.url('/ping'), timeout: 50})
      .then(function(){
        throw new Error('Server not down')
      })
      .catch(Error,client.handleNetworkError)
      .catch(NetworkError,function(err){
        expect(err.message).to.match(/ECONNREFUSED|ETIMEDOUT/)
      })
  }
}


/**
 * Check if public routes work on a prism
 * @param {object} prism
 * @return {Function}
 */
exports.checkPublic = function(prism){
  return function(){
    var client = api.prism(prism.prism)
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
  }
}


/**
 * Check if protected routes require authentication on a prism
 * @param {object} prism
 * @return {Function}
 */
exports.checkProtected = function(prism){
  return function(){
    var client = api.prism(prism.prism)
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
  }
}


/**
 * Login to a prism
 * @param {object} prism
 * @return {Function}
 */
exports.prismLogin = function(prism){
  return function(){
    var client = api.prism(prism.prism)
    return client.postAsync({
      url: client.url('/user/login'),
      json: {
        username: exports.user.username,
        password: exports.user.password
      },
      localAddress: '127.0.0.1'
    })
      .spread(function(res,body){
        expect(body.session).to.be.an('object')
        return body.session
      })
  }
}


/**
 * Logout of a prism
 * @param {object} prism
 * @param {object} session
 * @return {Function}
 */
exports.prismLogout = function(prism,session){
  return function(){
    var client = api.setSession(session,api.prism(prism.prism))
    return client.postAsync({
      url: client.url('/user/logout'),
      localAddress: '127.0.0.1'
    })
      .spread(function(res,body){
        expect(body.success).to.equal('User logged out')
      })
  }
}


/**
 * Content upload
 * @param {object} prism
 * @return {Function}
 */
exports.contentUpload = function(prism){
  return function(){
    var client = api.setSession(exports.user.session,api.prism(prism.prism))
    return client
      .postAsync({
        url: client.url('/content/upload'),
        formData: {
          file: fs.createReadStream(content.file)
        },
        localAddress: '127.0.0.1'
      })
      .spread(function(res,body){
        expect(body.files.file.sha1).to.equal(content.sha1)
      })
  }
}


/**
 * Get content detail
 * @param {object} prism
 * @param {object} options
 * @return {Function}
 */
exports.contentExists = function(prism,options){
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


/**
 * Get content detail
 * @param {object} prism
 * @return {Function}
 */
exports.contentDetail = function(prism){
  return function(){
    var client = api.setSession(exports.user.session,api.prism(prism.prism))
    return client
      .postAsync({
        url: client.url('/content/detail'),
        json: {sha1: content.sha1},
        localAddress: '127.0.0.1'
      })
      .spread(function(res,body){
        expect(body.sha1).to.equal(content.sha1)
        expect(body.count).to.be.greaterThan(0)
        expect(body.exists).to.equal(true)
        expect(body.map).to.be.an('object')
      })
  }
}


/**
 * Invalidate content existence
 * @param {object} prism
 * @return {Function}
 */
exports.contentExistsInvalidate = function(prism){
  return function(){
    var client = api.prism(prism.prism)
    return client.postAsync({
      url: client.url('/content/exists/invalidate'),
      json: {sha1: content.sha1}
    })
      .spread(function(res,body){
        expect(body.success).to.equal('Cleared')
        expect(body.sha1).to.equal(content.sha1)
      })
  }
}


/**
 * Purchase content
 * @param {object} prism
 * @return {Function}
 */
exports.contentPurchase = function(prism){
  return function(){
    var client = api.setSession(exports.user.session,api.prism(prism.prism))
    return client
      .postAsync({
        url: client.url('/content/purchase'),
        json: {
          sha1: content.sha1,
          ip: '127.0.0.1',
          referrer: ['localhost']
        },
        localAddress: '127.0.0.1'
      })
      .spread(function(res,body){
        expect(body.token.length).to.equal(64)
        expect(body.ext).to.equal('txt')
        expect(body.life).to.equal(21600)
        expect(body.sha1).to.equal(content.sha1)
        expect(body.referrer).to.be.an('array')
        expect(body.referrer[0]).to.equal('localhost')
        return body
      })
  }
}


/**
 * Deliver content
 * @param {object} prism
 * @param {string} localAddress
 * @param {string} referrer
 * @return {Function}
 */
exports.contentDeliver = function(prism,localAddress,referrer){
  return function(){
    var client = api.prism(prism.prism)
    var options = {
      url: client.url('/' + exports.purchase.token + '/' + content.filename),
      headers: {
        'Referer': referrer || 'localhost'
      },
      followRedirect: false,
      localAddress: localAddress || '127.0.0.1'
    }
    return client.getAsync(options)
      .spread(function(res){
        expect(res.statusCode).to.equal(302)
        var uri = url.parse(res.headers.location)
        var host = uri.host.split('.')
        expect(host[0]).to.match(/^store\d{1}$/)
        expect(host[1]).to.equal(prism.domain)
        expect(uri.pathname).to.equal(
          '/' + exports.purchase.token + '/' + content.filename)
      })
  }
}


/**
 * Download content
 * @param {object} prism
 * @return {Function}
 */
exports.contentDownload = function(prism){
  return function(){
    var client = api.setSession(exports.user.session,api.prism(prism.prism))
    return client.postAsync({
      url: client.url('/content/download'),
      json: {sha1: content.sha1},
      localAddress: '127.0.0.1'
    })
      .spread(function(res,body){
        expect(body).to.equal(content.data)
      })
  }
}


/**
 * Remove content purchase
 * @param {object} prism
 * @return {Function}
 */
exports.contentPurchaseRemove = function(prism){
  return function(){
    var client = api.setSession(exports.user.session,api.prism(prism.prism))
    return client.postAsync({
      url: client.url('/content/remove'),
      json: {token: exports.purchase.token},
      localAddress: '127.0.0.1'
    })
      .spread(function(res,body){
        expect(body.token).to.equal(exports.purchase.token)
        expect(body.count).to.equal(1)
        expect(body.success).to.equal('Purchase removed')
      })
  }
}
