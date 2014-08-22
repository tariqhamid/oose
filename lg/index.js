'use strict';
var bodyParser = require('body-parser')
var cookieParser = require('cookie-parser')
var flash = require('connect-flash')
var session = require('express-session')

var express = require('express')
var app = express()
var server = require('http').createServer(app)
var RedisStore = require('connect-redis')(express)

var config = require('../config')
var routes = require('./routes')
var logger = require('../helpers/logger').create('lg')

var running = false

app.locals.pretty = true
app.locals.version = config.get('version')
app.locals.prettyBytes = require('pretty-bytes')
app.locals.moment = require('moment')

app.set('views',__dirname + '/views')
app.set('view engine','jade')

app.use(express.static(__dirname + '/public'))
app.use(bodyParser.urlencoded({extended:false}))
app.use(express.basicAuth(config.get('lg.user'),config.get('lg.password')))
app.use(cookieParser(config.get('lg.cookie.secret')))
app.use(session({
  cookie: {
    maxAge: config.get('lg.cookie.maxAge')
  },
  store: new RedisStore(),
  secret: config.get('lg.cookie.secret'),
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
  server.listen(config.get('lg.port'),config.get('lg.host'),function(err){
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
