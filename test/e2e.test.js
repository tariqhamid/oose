'use strict';
var P = require('bluebird')
//P.longStackTraces() //turn of for easier debugging
var expect = require('chai').expect
var infant = require('infant')
var ObjectManage = require('object-manage')
var request = require('request')
var url = require('url')

var api = require('../helpers/api')
var APIClient = require('../helpers/APIClient')
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
 * @type {APIClient}
 */
api.master = new APIClient(clconf.master.master.port,clconf.master.master.host)
api.master.setBasicAuth(
  clconf.master.master.username,
  clconf.master.master.password)

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
var uploadContent = function(prism){
  return function(){
    return api.prism(prism.prism).setSession(user.session)
      .upload('/content/upload',content.file)
      .spread(function(res,body){
        expect(body.files.file.sha1).to.equal(content.sha1)
      })
  }
}

var contentExists = function(prism){
  return function(){
    return api.prism(prism.prism).setSession(user.session)
      .post('/content/exists',{sha1: content.sha1})
      .spread(function(res,body){
        expect(body.sha1).to.equal(content.sha1)
        expect(body.exists).to.equal(true)
        expect(body.count).to.equal(2)
        expect(body.map.prism1).to.be.an('object')
        expect(body.map.prism1.exists).to.equal(true)
        expect(Object.keys(body.map.prism1).length).to.equal(3)
        expect(body.map.prism2).to.be.an('object')
        expect(body.map.prism2.exists).to.equal(true)
        expect(Object.keys(body.map.prism1).length).to.equal(3)
      })
  }
}

var purchaseContent = function(prism){
  return function(){
    return api.prism(prism.prism).setSession(user.session)
      .post('/content/purchase',{sha1: content.sha1, ip: '127.0.0.1'})
      .spread(function(res,body){
        expect(body.token.length).to.equal(64)
        expect(body.ext).to.equal('txt')
        expect(body.life).to.equal(21600)
        expect(body.sha1).to.equal(content.sha1)
        purchase = body
      })
  }
}

var deliverContent = function(prism){
  return function(){
    var options = {
      url: 'http://' + prism.prism.host + ':' + prism.prism.port +
      '/' + purchase.token + '/' + content.filename,
      followRedirect: false,
      localAddress: '127.0.0.1'
    }
    return request.getAsync(options)
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

var downloadContent = function(prism){
  return function(){
    return api.prism(prism.prism).setSession(user.session)
      .post('/content/download',{sha1: content.sha1})
      .spread(function(res,body){
        expect(body).to.equal(content.data)
      })
  }
}



describe('e2e',function(){
  describe('e2e:prism',function(){
    //spin up an entire cluster here
    this.timeout(10000)
    //start servers and create a user
    before(function(){
      console.log('Starting mock cluster....')
      return P.all([
        masterServer.startAsync(),
        prismServer1.startAsync(),
        prismServer2.startAsync(),
        storeServer1.startAsync(),
        storeServer2.startAsync(),
        storeServer3.startAsync(),
        storeServer4.startAsync()
      ])
        .then(function(){
          //create user
          return P.try(function(){
            return api.master.post('/user/create',{username: user.username})
          })
            .spread(function(res,body){
              user.password = body.password
              return P.all([
                expect(body.success).to.equal('User created'),
                expect(body.id).to.be.greaterThan(0),
                expect(body.password.length).to.equal(64)
              ])
            }).then(function(){
              //create prisms
              var promises = []
              var prisms = ['prism1','prism2']
              var prism
              for(var i = 0; i < prisms.length; i++){
                prism = clconf[prisms[i]]
                promises.push(
                  api.master.post('/prism/create',{
                    name: prism.prism.name,
                    domain: prism.domain,
                    site: prism.site,
                    zone: prism.zone,
                    host: prism.host,
                    ip: prism.prism.host,
                    port: prism.prism.port
                  }))
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
                promises.push(
                  api.master.post('/store/create',{
                    prism: store.prism.name,
                    name: store.store.name,
                    ip: store.store.host,
                    port: store.store.port
                  }))
              }
              return P.all(promises)
            })
            .then(function(){
              console.log('Mock cluster started!')
            })
            .catch(function(err){
              console.trace(err)
            })
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
          promises.push(api.master.post('/store/remove',{name: stores[i]}))
        }
        return P.all(promises)
      })
        .then(function(){
          //remove prisms
          var promises = []
          var prisms = ['prism1','prism2']
          for(var i = 0; i < prisms.length; i++){
            promises.push(api.master.post('/prism/remove',{name: prisms[i]}))
          }
          return P.all(promises)
        })
        .then(function(){
          //remove user
          return api.master.post('/user/remove',{username: user.username})
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
    it('master should be up',function(){
      return api.master.post('/ping')
        .spread(function(res,body){
          expect(body.pong).to.equal('pong')
        })
    })
    it('prism1 should be up',function(){
      return api.prism(clconf.prism1.prism).post('/ping')
        .spread(function(res,body){
          expect(body.pong).to.equal('pong')
        })
    })
    it('prism2 should be up',function(){
      return api.prism(clconf.prism2.prism).post('/ping')
        .spread(function(res,body){
          expect(body.pong).to.equal('pong')
        })
    })
    it('store1 should be up',function(){
      return api.store(clconf.store1.store).post('/ping')
        .spread(function(res,body){
          expect(body.pong).to.equal('pong')
        })
    })
    it('store2 should be up',function(){
      return api.store(clconf.store2.store).post('/ping')
        .spread(function(res,body){
          expect(body.pong).to.equal('pong')
        })
    })
    it('store3 should be up',function(){
      return api.store(clconf.store3.store).post('/ping')
        .spread(function(res,body){
          expect(body.pong).to.equal('pong')
        })
    })
    it('store4 should be up',function(){
      return api.store(clconf.store4.store).post('/ping')
        .spread(function(res,body){
          expect(body.pong).to.equal('pong')
        })
    })
    it('should not require authentication for public functions',function(){
      var prism = clconf.prism1.prism
      var client = new APIClient(prism.port,prism.host)
      return client
        .post('/')
        .spread(function(res,body){
          expect(body.message).to.equal(
            'Welcome to OOSE version ' + config.version)
          return client.post('/ping')
        })
        .spread(function(res,body){
          expect(body.pong).to.equal('pong')
          return client.post('/user/login')
        })
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
      return client.post('/user/logout')
        .catch(UserError,function(err){
          expect(err.message).to.match(/Invalid response code \(401\) to POST/)
          return client.post('/user/password/reset')
        })
        .catch(UserError,function(err){
          expect(err.message).to.match(/Invalid response code \(401\) to POST/)
          return client.post('/user/session/validate')
        })
        .catch(UserError,function(err){
          expect(err.message).to.match(/Invalid response code \(401\) to POST/)
          return client.post('/content/upload')
        })
        .catch(UserError,function(err){
          expect(err.message).to.match(/Invalid response code \(401\) to POST/)
          return client.post('/content/purchase')
        })
        .catch(UserError,function(err){
          expect(err.message).to.match(/Invalid response code \(401\) to POST/)
          return client.post('/content/remove')
        })
        .catch(UserError,function(err){
          expect(err.message).to.match(/Invalid response code \(401\) to POST/)
        })
    })
    it('should login to prism1',function(){
      return api.prism(clconf.prism1.prism).post('/user/login',{
        username: user.username,
        password: user.password
      })
        .spread(function(res,body){
          expect(body.session).to.be.an('object')
          user.session = body.session
        })
    })
    it('should login to prism2',function(){
      var prism = api.prism(clconf.prism1.prism)
      return prism
        .post('/user/login',{
          username: user.username,
          password: user.password
        })
        .spread(function(res,body){
          expect(body.session).to.be.an('object')
          prism.setSession(body.session)
          return prism.post('/user/logout')
        })
        .spread(function(res,body){
          expect(body.success).to.equal('User logged out')
        })
    })

    it('should upload content',uploadContent(clconf.prism1))

    it('should show the content exists in 2 places',
      contentExists(clconf.prism1))

    it('should allow API download of the content',
      downloadContent(clconf.prism1))

    it('should allow purchase of the content',
      purchaseContent(clconf.prism1))

    it('should accept a purchased URL and deliver content on prism1',
      deliverContent(clconf.prism1))

    it('should accept a purchased URL and deliver content on prism2',
      deliverContent(clconf.prism2))

    it('should deny a request from a bad ip',function(){
      var prism = clconf.prism2.prism
      var options = {
        url: 'http://' + prism.host + ':' + prism.port +
        '/' + purchase.token + '/' + content.filename,
        followRedirect: false,
        localAddress: '127.0.0.2'
      }
      return request.getAsync(options)
        .spread(function(res,body){
          body = JSON.parse(body)
          expect(res.statusCode).to.equal(500)
          expect(body.error).to.equal('Invalid IP')
        })
    })
    it('should allow removal of purchases',function(){
      return api.prism(clconf.prism2.prism).setSession(user.session)
        .post('/content/remove',{token: purchase.token})
        .spread(function(res,body){
          expect(body.token).to.equal(purchase.token)
          expect(body.count).to.equal(1)
          expect(body.success).to.equal('Purchase removed')
        })
    })
    describe('master down',function(){
      before(function(){
        return uploadContent(clconf.prism1)()
          .then(function(){
            return masterServer.stopAsync()
          })
      })
      after(function(){
        return masterServer.startAsync()
          .then(function(){
          })
      })
      it('master should be down',function(){
        return api.master.post('/ping')
          .then(function(){
            throw new Error('Master not down')
          })
          .catch(NetworkError,function(err){
            expect(err.message).to.equal('connect ECONNREFUSED')
          })
      })
      it('should still purchase content',purchaseContent(clconf.prism1))
      it('should still deliver content',deliverContent(clconf.prism1))
      it('should still download content',downloadContent(clconf.prism1))
    })
    describe.skip('prism2 down',function(){
      before(function(){
        return prismServer2.stopAsync()
      })
      after(function(){
        return prismServer2.startAsync()
      })
      it('should still purchase content',purchaseContent(clconf.prism1))
      it('should still deliver content',deliverContent(clconf.prism1))
      it('should still download content',downloadContent(clconf.prism1))
    })
    describe.skip('prism1 down',function(){
      before(function(){
        return prismServer1.stopAsync()
      })
      after(function(){
        return prismServer1.startAsync()
      })
      it('should still purchase content',purchaseContent(clconf.prism2))
      it('should still deliver content',deliverContent(clconf.prism2))
      it('should still download content',downloadContent(clconf.prism2))
    })
    describe.skip('store1 and store3 down',function(){
      before(function(){
        return storeServer1.stopAsync()
      })
      after(function(){
        return storeServer3.startAsync()
      })
      it('should still purchase content',purchaseContent(clconf.prism1))
      it('should still deliver content',deliverContent(clconf.prism1))
      it('should still download content',downloadContent(clconf.prism1))
    })
    describe.skip('store2 and store4 down',function(){
      before(function(){
        return storeServer2.stopAsync()
      })
      after(function(){
        return storeServer4.startAsync()
      })
      it('should still purchase content',purchaseContent(clconf.prism1))
      it('should still deliver content',deliverContent(clconf.prism1))
      it('should still download content',downloadContent(clconf.prism1))
    })
  })

})
