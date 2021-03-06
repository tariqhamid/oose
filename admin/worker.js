'use strict';
var P = require('bluebird')
var bodyParser = require('body-parser')
var compress = require('compression')
var cookieParser = require('cookie-parser')
var flash = require('connect-flash')
var express = require('express')
var expressSession = require('express-session')
var http = require('http')
var worker = require('infant').worker
var morgan = require('morgan')
var RedisStore = require('connect-redis')(expressSession)

var sequelize = require('../helpers/sequelize')()

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
  S: require('string'),
  moment: require('moment'),
  prettyBytes: require('pretty-bytes'),
  version: config.version
}


//setup view enging
app.set('trust proxy',true)
app.set('views',__dirname + '/' + 'views')
app.set('view engine','jade')

//load middleware
app.use(compress())
app.use(bodyParser.urlencoded({extended: true}))
app.use(bodyParser.json())
app.use(cookieParser(config.admin.cookie.secret))
app.use(expressSession({
  cookie: {
    maxAge: config.admin.cookie.maxAge
  },
  resave: true,
  saveUninitialized: true,
  store: new RedisStore(),
  secret: config.admin.cookie.secret
}))
app.use(flash())
app.use(function(req,res,next){
  res.locals.flash = req.flash.bind(req)
  next()
})
app.use(express.static(__dirname + '/public'))

app.use(function(req,res,next){
  //allow public routes
  if(req.url.match(/\/api\//)) return next()
  //private
  if(!req.session.staff && req.url.indexOf('/login') < 0){
    res.redirect('/login')
  } else {
    app.locals.staff = req.session.staff
    next()
  }
})


// development only
if('development' === app.get('env'))
  app.use(morgan('dev'))

//----------------
//public routes
//----------------

//app.post('/api/shredderUpdate',routes.shredder.update)

//----------------
//private routes
//----------------


//auth
app.post('/login',routes.staff.loginAction)
app.get('/login',routes.staff.login)
app.get('/logout',routes.staff.logout)

//staff
app.post('/staff/list',routes.staff.listAction)
app.post('/staff/save',routes.staff.save)
app.get('/staff/list',routes.staff.list)
app.get('/staff/create',routes.staff.create)
app.get('/staff/edit',routes.staff.edit)
app.get('/staff',function(req,res){ res.redirect('/staff/list') })

//user
app.post('/user/list',routes.user.listAction)
app.post('/user/save',routes.user.save)
app.post('/user/find',routes.user.find)
app.post('/user/update',routes.user.update)
app.post('/user/login',routes.user.login)
app.post('/user/logout',routes.user.logout)
app.post('/user/remove',routes.user.remove)
app.post('/user/password/reset',routes.user.passwordReset)
app.post('/user/session/find',routes.user.sessionFind)
app.post('/user/session/validate',routes.user.sessionFind)
app.post('/user/session/update',routes.user.sessionUpdate)
app.post('/user/session/remove',routes.user.sessionRemove)
app.get('/user/list',routes.user.list)
app.get('/user/create',routes.user.create)
app.get('/user/edit', routes.user.edit)
app.get('/user',function(req,res){ res.redirect('/user/list') })


//prisms
app.post('/prism/list',routes.prism.listAction)
app.post('/prism/save',routes.prism.save)
app.get('/prism/list',routes.prism.list)
app.get('/prism/create',routes.prism.create)
app.get('/prism/edit',routes.prism.edit)
app.get('/prism',function(req,res){ res.redirect('/') })

//stores
app.post('/store/save',routes.store.save)
app.post('/store/remove',routes.store.remove)
app.get('/store/create',routes.store.create)
app.get('/store/edit',routes.store.edit)


//home page
app.get('/',routes.index)


/**
 * Start admin
 * @param {function} done
 */
exports.start = function(done){
  sequelize.doConnect()
    .then(function(){
      return server.listenAsync(+config.admin.port,config.admin.host)
    }).then(done).catch(function(err){
      done(err)
    })
}


/**
 * Stop admin
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
    'oose:admin:worker',
    function(done){
      exports.start(done)
    },
    function(done){
      exports.stop(done)
    }
  )
}
