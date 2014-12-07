'use strict';
var P = require('bluebird')
var basicAuth = require('basic-auth-connect')
var bodyParser = require('body-parser')
var compress = require('compression')
var express = require('express')
var http = require('http')
var worker = require('infant').worker

var sequelize = require('./helpers/sequelize')()

var app = express()
var config = require('../config')
var server = http.createServer(app)
var routes = require('./routes')

//make some promises
P.promisifyAll(server)


/**
 * Global template vars
 * @type {*}
 */
app.locals = {
  pretty: true,
  version: config.version
}


//setup view enging
app.set('trust proxy',true)

//load middleware
app.use(compress())
app.use(basicAuth(config.master.username,config.master.password))
app.use(bodyParser.json())
app.use(express.static(__dirname + '/public'))

//memory
app.post('/memory/create',routes.memory.create)
app.post('/memory/find',routes.memory.find)
app.post('/memory/exists',routes.memory.exists)
app.post('/memory/update',routes.memory.update)
app.post('/memory/remove',routes.memory.remove)

//prism
app.post('/prism/create',routes.prism.create)
app.post('/prism/find',routes.prism.find)
app.post('/prism/list',routes.prism.list)
app.post('/prism/update',routes.prism.update)
app.post('/prism/remove',routes.prism.remove)

//store
app.post('/store/create',routes.store.create)
app.post('/store/find',routes.store.find)
app.post('/store/list',routes.store.list)
app.post('/store/update',routes.store.update)
app.post('/store/remove',routes.store.remove)

//user
app.post('/user/create',routes.user.create)
app.post('/user/find',routes.user.find)
app.post('/user/update',routes.user.update)
app.post('/user/login',routes.user.login)
app.post('/user/logout',routes.user.logout)
app.post('/user/remove',routes.user.remove)
app.post('/user/password/reset',routes.user.passwordReset)
app.post('/user/session/find',routes.user.sessionFind)
app.post('/user/session/update',routes.user.sessionUpdate)

//home page
app.post('/',routes.index)


/**
* Start oose master
* @param {function} done
*/
exports.start = function(done){
  sequelize.doConnect()
    .then(function(){
      return server.listenAsync(+config.master.port,config.master.host)
    })
    .then(function(){
      //create the master record (if it doesnt exist)
      var Master = sequelize.models.Master
      return Master.findOrCreate({
        where: {
          domain: config.domain
        },
        defaults: {
          name: config.master.name,
          domain: config.domain,
          ip: config.master.host || '127.0.0.1',
          port: +config.master.port
        }
      })
    })
    .then(function(){
      done()
    })
    .catch(function(err){
      done(err)
    })
}


/**
 * Stop oose master
 * @param {function} done
 */
exports.stop = function(done){
  //dont wait for this since it will take to long and we are stopping now
  server.close()
  //close our db connection
  sequelize.close()
  //just return now
  done()
}

if(require.main === module){
  worker(
    server,
    'oose:master:worker',
    function(done){
      exports.start(done)
    },
    function(done){
      exports.stop(done)
    }
  )
}
