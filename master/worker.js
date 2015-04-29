'use strict';
var P = require('bluebird')
var basicAuth = require('basic-auth-connect')
var bodyParser = require('body-parser')
var express = require('express')
var fs = require('graceful-fs')
var https = require('https')
var worker = require('infant').worker

var sequelize = require('./../helpers/sequelize')()

var app = express()
var config = require('../config')
var sslOptions = {
  key: fs.readFileSync(config.ssl.pem),
  cert: fs.readFileSync(config.ssl.pem)
}
var server = https.createServer(sslOptions,app)
var routes = require('./routes')

//make some promises
P.promisifyAll(server)

//home page
app.get('/',routes.index)
app.post('/',routes.index)

//health test
app.get('/ping',routes.ping)
app.post('/ping',routes.ping)

//load middleware
app.use(basicAuth(config.master.username,config.master.password))
app.use(bodyParser.json({limit: '100mb'}))

//inventory
app.post('/inventory/create',routes.inventory.create)
app.post('/inventory/find',routes.inventory.find)
app.post('/inventory/exists',routes.inventory.exists)
app.post('/inventory/feed',routes.inventory.feed)
app.post('/inventory/remove',routes.inventory.remove)

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
app.post('/user/list',routes.user.list)
app.post('/user/update',routes.user.update)
app.post('/user/login',routes.user.login)
app.post('/user/logout',routes.user.logout)
app.post('/user/remove',routes.user.remove)
app.post('/user/password/reset',routes.user.passwordReset)
app.post('/user/session/list',routes.user.sessionList)
app.post('/user/session/feed',routes.user.sessionFeed)
app.post('/user/session/find',routes.user.sessionFind)
app.post('/user/session/validate',routes.user.sessionFind)
app.post('/user/session/update',routes.user.sessionUpdate)


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
          host: config.master.host || '127.0.0.1',
          port: +config.master.port
        }
      })
    })
    .spread(function(){
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
    'oose:' + config.master.name + ':worker',
    function(done){
      exports.start(done)
    },
    function(done){
      exports.stop(done)
    }
  )
}
