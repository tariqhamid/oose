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
app.use(express.static(__dirname + '/public'))

//home page
app.post('/',routes.index)

//user functions
app.post('/login',routes.login)
app.post('/logout',routes.logout)
app.post('/password/reset',routes.passwordReset)

//content functions
app.post('/upload',routes.upload)
app.post('/purchase',routes.purchase)

//main content retrieval function
app.get('/download/:sha1/:filename',routes.download)


/**
* Start oose master
* @param {function} done
*/
exports.start = function(done){
  server.listenAsync(+config.prism.port,config.prism.host)
    .then(function(){
      done()
    })
}


/**
 * Stop oose master
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
