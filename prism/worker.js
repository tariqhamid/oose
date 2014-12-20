'use strict';
var P = require('bluebird')
var basicAuth = require('basic-auth-connect')
var bodyParser = require('body-parser')
var express = require('express')
var http = require('http')
var worker = require('infant').worker

var userSessionValidate = require('../helpers/userSessionValidate')

var app = express()
var config = require('../config')
var server = http.createServer(app)
var routes = require('./routes')

//make some promises
P.promisifyAll(server)

//setup view enging
app.set('trust proxy',true)
app.use(bodyParser.json())


//--------------------
//public routes
//--------------------

//home page
app.post('/',routes.index)

//health test
app.post('/ping',routes.ping)

//--------------------
//protected routes
//--------------------

//user functions
app.post('/user/login',routes.user.login)
app.post('/user/logout',userSessionValidate,routes.user.logout)
app.post('/user/password/reset',userSessionValidate,routes.user.passwordReset)
app.post(
  '/user/session/validate',userSessionValidate,routes.user.sessionValidate)
app.post('/user/session/update',userSessionValidate,routes.user.sessionUpdate)

//content functions
app.post('/content/upload',userSessionValidate,routes.content.upload)
app.post('/content/purchase',userSessionValidate,routes.content.purchase)
app.post('/content/remove',userSessionValidate,routes.content.remove)

//--------------------
//private routes
//--------------------
var auth = basicAuth(config.prism.username,config.prism.password)

//content
app.post('/content/exists',auth,routes.content.exists)
app.post('/content/existsLocal',auth,routes.content.existsLocal)
app.post('/content/download',auth,routes.content.download)
app.put('/content/put/:file',auth,routes.content.put)

//purchases
app.post('/purchase/create',auth,routes.purchase.create)
app.post('/purchase/find',auth,routes.purchase.find)
app.post('/purchase/update',auth,routes.purchase.update)
app.post('/purchase/remove',auth,routes.purchase.remove)


//main content retrieval route
app.get('/:token/:filename',routes.content.deliver)


/**
* Start oose prism
* @param {function} done
*/
exports.start = function(done){
  server.listenAsync(+config.prism.port,config.prism.host)
    .then(function(){
      done()
    })
}


/**
 * Stop oose prism
 * @param {function} done
 */
exports.stop = function(done){
  //dont wait for this since it will take to long and we are stopping now
  server.close()
  //just return now
  done()
}

if(require.main === module){
  worker(
    server,
    'oose:' + config.prism.name + ':worker',
    function(done){
      exports.start(done)
    },
    function(done){
      exports.stop(done)
    }
  )
}
