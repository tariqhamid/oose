'use strict';
var bodyParser = require('body-parser')
var cookieParser = require('cookie-parser')
var flash = require('connect-flash')
var session = require('express-session')
var basicAuth = require('basic-auth')

var express = require('express')
var app = express()
var server = require('http').createServer(app)
var RedisStore = require('connect-redis')(session)

var config = require('../config')
var routes = require('./routes')
var logger = require('../helpers/logger').create('lg')

var running = false

app.locals.pretty = true
app.locals.version = config.version
app.locals.prettyBytes = require('pretty-bytes')
app.locals.moment = require('moment')

app.set('views',__dirname + '/views')
app.set('view engine','jade')

app.use(function(req,res,next){
  var username = config.lg.user
  var password = config.lg.password
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

app.use(express.static(__dirname + '/public'))
app.use(bodyParser.urlencoded({extended:false}))
app.use(cookieParser(config.lg.cookie.secret))
app.use(session({
  cookie: {
    maxAge: config.lg.cookie.maxAge
  },
  store: new RedisStore(config.redis),
  secret: config.lg.cookie.secret,
  resave: true,
  saveUninitialized: true
}))
app.use(flash())
app.use(function(req,res,next){
  res.locals.flash = req.flash.bind(req)
  next()
})

//routing
app.get('/',routes.index)


/**
 * Start server
 * @param {function} done
 */
exports.start = function(done){
  server.listen(config.lg.port,config.lg.host,function(err){
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
