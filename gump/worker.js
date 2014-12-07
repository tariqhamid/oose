'use strict';
var async = require('async')
var bodyParser = require('body-parser')
var busboy = require('connect-busboy')
var cookieParser = require('cookie-parser')
var flash = require('connect-flash')
var express = require('express')
var session = require('express-session')
var worker = require('infant').worker
var mongoose = require('mongoose')

var app = express()
var server = require('http').createServer(app)
var RedisStore = require('connect-redis')(session)

//var logger = require('../helpers/logger').create('prism')
var redis = require('../helpers/redis')

var config = require('../config')
var routes = require('./routes')

var running = false


/**
 * Pretty source code
 * @type {boolean}
 */
app.locals.pretty = true


/**
 * App version
 * @type {exports.version|*|string|version}
 */
app.locals.version = config.version


/**
 * Pretty byte formatter
 * @type {prettyBytes|exports}
 */
app.locals.prettyBytes = require('pretty-bytes')

app.set('views',__dirname + '/views')
app.set('view engine','jade')

app.use(express.static(__dirname + '/public'))
app.use(busboy({
  limits: {
    fileSize: config.gump.maxUploadSize
  }
}))
app.use(bodyParser.urlencoded({extended:true}))
app.use(bodyParser.json())
app.use(cookieParser(config.gump.cookie.secret))
app.use(session({
  cookie: {
    maxAge: config.gump.cookie.maxAge
  },
  store: new RedisStore({client:redis}),
  secret: config.gump.cookie.secret,
  resave: true,
  saveUninitialized: true
}))
app.use(flash())
app.use(function(req,res,next){
  res.locals.flash = req.flash.bind(req)
  next()
})

//login functionality
app.use(function(req,res,next){
  //allow public routes
  if(req.url.match(/\/(api|download|embed)\//)) return next()
  //dont redirect loop the login page
  // however make sure we are there when not logged in
  if((!req.session.user) && (-1 === req.url.indexOf('/login'))){
    req.session.loginFrom = !req.url.match(/favicon|css|png/) ? req.url : '/'
    return res.redirect('/login')
  }
  //normally user is logged in
  app.locals.user = req.session.user
  next()
})

//----------------
//public routes
//----------------

//api
app.get('/api/embedDetails/:handle',routes.embed.apiDetails)
app.post('/api/shredderUpdate',routes.shredderUpdate)

//download
app.get('/download',routes.download)

//embed
app.get('/embed/:handle',routes.embed.render)


//----------------
//private routes
//----------------

//auth
app.post('/login',routes.user.login)
app.get('/login',routes.user.login)
app.get('/logout',routes.user.logout)

//users (admin)
app.post('/users',routes.user.list)
app.post('/users/save',routes.user.save)
app.get('/users',routes.user.list)
app.get('/users/create',routes.user.form)
app.get('/users/edit',routes.user.form)

//file manage
app.post('/upload',routes.upload)
app.post('/folderCreate',routes.folderCreate)
app.post('/',routes.fileRemove)
app.get('/file',routes.file)
app.get('/',routes.index)


/**
 * Start server
 * @param {function} done
 */
exports.start = function(done){
  async.series(
    [
      function(next){
        mongoose.connect(config.mongoose.dsn,config.mongoose.options,next)
      },
      function(next){
        server.listen(config.gump.port,config.gump.host,function(err){
          if(err) return next(err)
          running = true
          next()
        })
      }
    ],
    done
  )
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
  mongoose.disconnect(done)
}

if(require.main === module){
  worker(
    server,
    'oose:' + config.locale.id + ':gump:worker',
    function(done){
      exports.start(done)
    },
    function(done){
      exports.stop(done)
    }
  )
}
