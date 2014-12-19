'use strict';
var P = require('bluebird')
var basicAuth = require('basic-auth-connect')
var bodyParser = require('body-parser')
var express = require('express')
var http = require('http')
var worker = require('infant').worker

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

//user functions
app.post('/user/login',routes.user.login)
app.post('/user/logout',routes.user.logout)
app.post('/user/password/reset',routes.user.passwordReset)
app.post('/user/session/validate',routes.user.sessionValidate)
app.post('/user/session/update',routes.user.sessionUpdate)

//content functions
app.post('/content/upload',routes.content.upload)
app.post('/content/purchase',routes.content.purchase)
app.post('/content/remove',routes.content.remove)

//--------------------
//protected routes
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
