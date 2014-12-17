'use strict';
var P = require('bluebird')
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

//load middleware
app.use(bodyParser.json())

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
app.post('/upload',routes.upload)
app.post('/purchase',routes.purchase)

//main content retrieval function
app.get('/download/:sha1/:filename',routes.download)


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
