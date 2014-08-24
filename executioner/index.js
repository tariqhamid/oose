'use strict';
var bodyParser = require('body-parser')
var cookieParser = require('cookie-parser')
var flash = require('connect-flash')
var fs = require('graceful-fs')
var methodOverride = require('method-override')
var session = require('express-session')
var basicAuth = require('basic-auth')

var express = require('express')
var app = express()
var server = require('http').createServer(app)
var RedisStore = require('connect-redis')(session)

var config = require('../config')
var routes = require('./routes')
var logger = require('../helpers/logger').create('executioner')
var redis = require('../helpers/redis')

var running = false


/**
 * Pretty html output
 * @type {boolean}
 */
app.locals.pretty = true


/**
 * App version
 */
app.locals.version = config.version


/**
 * Load moment into jade
 */
app.locals.moment = require('moment')


/**
 * Read public ssh key for use in templates
 */
app.locals.ssh = {
  publicKey:
    fs.existsSync(config.executioner.ssh.publicKey) ?
      fs.readFileSync(config.executioner.ssh.publicKey) :
      null
}

app.use(function(req,res,next){
  var username = config.executioner.user
  var password = config.executioner.password
  if(!username || !password){
    res.status(500)
    res.send('Missing username and/or password')
  }
  function unauthorized(res){
    res.set('WWW-Authenticate','Basic realm=Authorization Required')
    return res.send(401)
  }
  var user = basicAuth(req)
  if(!user || !user.name || !user.pass){
    return unauthorized(res)
  }
  if(user.name === username && user.pass === password){
    return next()
  } else {
    return unauthorized(res)
  }
})

app.set('views',__dirname + '/' + 'views')
app.set('view engine','jade')
app.use(bodyParser.urlencoded({extended:true}))
app.use(bodyParser.json())
app.use(methodOverride())
app.use(cookieParser(config.executioner.cookie.secret))
app.use(session({
  cookie: {
    maxAge: config.executioner.cookie.maxAge
  },
  store: new RedisStore({client:redis}),
  secret: config.executioner.cookie.secret,
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
  if(!config.executioner.user || !config.executioner.password){
    logger.warning('Refusing to start executioner, missing username and/or password')
    return done()
  }
  server.listen(config.executioner.port,config.executioner.host,function(err){
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
