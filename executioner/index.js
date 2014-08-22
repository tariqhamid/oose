'use strict';
var bodyParser = require('body-parser')
var cookieParser = require('cookie-parser')
var flash = require('connect-flash')
var fs = require('graceful-fs')
var session = require('express-session')

var express = require('express')
var app = express()
var server = require('http').createServer(app)
var RedisStore = require('connect-redis')(express)

var config = require('../config')
var routes = require('./routes')
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

app.set('views',__dirname + '/' + 'views')
app.set('view engine','jade')
app.use(bodyParser.urlencoded({extended:false}))
app.use(bodyParser.json())
app.use(cookieParser(config.get('executioner.cookie.secret')))
app.use(session({
  cookie: {
    maxAge: config.get('executioner.cookie.maxAge')
  },
  store: new RedisStore(),
  secret: config.get('executioner.cookie.secret'),
  resave: true,
  saveUninitialized: true
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
app.post('/peer/runCommand',routes.peer.runCommand)
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
  if(server && running){
    running = false
    server.close()
  }
  done()
}
