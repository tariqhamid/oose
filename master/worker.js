'use strict';
var P = require('bluebird')
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
app.use(bodyParser.json())
app.use(express.static(__dirname + '/public'))

//hideout
app.post('/hideout/set',routes.hideout.set)
app.post('/hideout/get',routes.hideout.get)
app.post('/hideout/exists',routes.hideout.exists)
app.post('/hideout/update',routes.hideout.update)
app.post('/hideout/remove',routes.hideout.remove)

//prism
app.post('/prism/create',routes.prism.create)
app.post('/prism/remove',routes.prism.remove)
app.post('/prism/update',routes.prism.update)
app.post('/prism/list',routes.prism.list)

//home page
app.get('/',routes.index)


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
          name: config.name,
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
