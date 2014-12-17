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

//load middleware
app.use(basicAuth(config.store.username,config.store.password))
app.use(bodyParser.json())

//home page
app.post('/',routes.index)

//health test
app.post('/ping',routes.ping)

//content functions
app.post('/content/upload',routes.content.upload)
app.post('/content/download',routes.content.download)
app.post('/content/exists',routes.content.exists)
app.post('/content/remove',routes.content.remove)

//content purchasing
app.post('/purchase/create',routes.purchase.create)
app.post('/purchase/update',routes.purchase.update)
app.post('/purchase/remove',routes.purchase.remove)


/**
* Start oose store
* @param {function} done
*/
exports.start = function(done){
  server.listenAsync(+config.store.port,config.store.host)
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
    'oose:' + config.store.name + ':worker',
    function(done){
      exports.start(done)
    },
    function(done){
      exports.stop(done)
    }
  )
}
