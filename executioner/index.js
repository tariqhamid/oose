'use strict';
require('moment-duration-format')
var express = require('express')
var fs = require('fs')
var flash = require('connect-flash')
var app = express()
var server = require('http').createServer(app)
var config = require('../config')
var routes = require('./routes')
var RedisStore = require('connect-redis')(express)
var logger = require('../helpers/logger').create('executioner')
var running = false


/**
 * Pretty html output
 * @type {boolean}
 */
app.locals.pretty = true


/**
 * App version
 */
app.locals.version = config.get('version')


/**
 * Load moment into jade
 */
app.locals.moment = require('moment')


/**
 * Read public ssh key for use in templates
 */
app.locals.ssh = {
  publicKey:
    fs.existsSync(config.get('executioner.ssh.publicKey')) ?
      fs.readFileSync(config.get('executioner.ssh.publicKey')) :
      null
}

//this is needed so we can gracefully decline to start
if(config.get('executioner.user') && config.get('executioner.password'))
  app.use(express.basicAuth(config.get('executioner.user'),config.get('executioner.password')))
app.use(express.json())

app.set('views',__dirname + '/' + 'views')
app.set('view engine','jade')
app.use(express.urlencoded())
app.use(express.json())
app.use(express.cookieParser(config.get('executioner.cookie.secret')))
app.use(express.session({
  cookie: {
    maxAge: config.get('executioner.cookie.maxAge')
  },
  store: new RedisStore(),
  secret: config.get('executioner.cookie.secret')
}))
app.use(flash())
app.use(function(req,res,next){
  res.locals.flash = req.flash.bind(req)
  next()
})
app.use(express.static(__dirname + '/public'))


//peer
app.post('/peer',routes.peer.list)
app.post('/peer/save',routes.peer.save)
app.get('/peer',routes.peer.list)
app.get('/peer/create',routes.peer.create)
app.get('/peer/edit',routes.peer.edit)
app.get('/peer/test',routes.peer.test)
app.get('/peer/refresh',routes.peer.refresh)
app.get('/peer/prepare',routes.peer.prepare)
app.get('/peer/install',routes.peer.install)
app.get('/peer/upgrade',routes.peer.upgrade)
app.get('/peer/updateConfig',routes.peer.updateConfig)
app.get('/peer/start',routes.peer.start)
app.get('/peer/stop',routes.peer.stop)
app.get('/peer/restart',routes.peer.restart)

//home page
app.get('/',routes.index)


/**
 * Start server
 * @param {function} done
 * @return {*}
 */
exports.start = function(done){
  if(!config.get('executioner.user') || !config.get('executioner.password')){
    logger.warning('Refusing to start executioner, missing username and/or password')
    return done()
  }
  server.listen(config.get('executioner.port'),config.get('executioner.host'),function(err){
    if(err) return done(err)
    running = true
    done()
  })
}


/**
 * Stop server
 * @param {function} done
 */
exports.stop = function(done){
  if('function' !== typeof done) done = function(){}
  if(server && running) server.close()
  done()
}
