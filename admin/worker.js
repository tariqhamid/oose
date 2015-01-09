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
    app.locals.user = req.session.staff
    next()
  }
})

// development only
if('development' === app.get('env'))
  app.use(morgan('dev'))

//----------------
//public routes
//----------------

app.post('/api/shredderUpdate',routes.shredder.update)

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

//shows
app.post('/show/list',routes.show.listAction)
app.post('/show/save',routes.show.save)
app.post('/show/importThumbnail',routes.show.importThumbnailAction)
app.get('/show/list',routes.show.list)
app.get('/show/create',routes.show.create)
app.get('/show/edit',routes.show.edit)
app.get('/show/importThumbnail',routes.show.importThumbnail)
app.get('/show',function(req,res){ res.redirect('/') })

//show episodes
app.post('/episode/save',routes.episode.save)
app.post('/episode/remove',routes.episode.remove)
app.get('/episode/create',routes.episode.create)
app.get('/episode/edit',routes.episode.edit)

//show video
app.post('/video/save',routes.video.save)
app.post('/video/remove',routes.video.remove)
app.post('/video/import',routes.video.importAction)
app.get('/video/create',routes.video.create)
app.get('/video/edit',routes.video.edit)
app.get('/video/import',routes.video.importForm)

//media
app.post('/media/remove',routes.media.remove)
app.post('/media/save',routes.media.save)
app.get('/media/edit',routes.media.edit)

//pages
app.post('/page/list',routes.page.listAction)
app.post('/page/save',routes.page.save)
app.get('/page/list',routes.page.list)
app.get('/page/create',routes.page.create)
app.get('/page/edit',routes.page.edit)
app.get('/page',function(req,res){ res.redirect('/page/list') })

//blog entries
app.post('/blog/list',routes.blog.listAction)
app.post('/blog/save',routes.blog.save)
app.get('/blog/list',routes.blog.list)
app.get('/blog/create',routes.blog.create)
app.get('/blog/edit',routes.blog.edit)
app.get('/blog',function(req,res){ res.redirect('/blog/list') })

//Video Report page
app.post('/videoReport/list',routes.videoReport.listAction)
app.get('/videoReport/list',routes.videoReport.list)
app.get('/videoReport',function(req,res){ res.redirect('/videoReport/list') })

//blog entries
app.post('/siteMaintenance/list',routes.siteMaintenance.listAction)
app.post('/siteMaintenance/save',routes.siteMaintenance.save)
app.get('/siteMaintenance/list',routes.siteMaintenance.list)
app.get('/siteMaintenance/create',routes.siteMaintenance.create)
app.get('/siteMaintenance/edit',routes.siteMaintenance.edit)
app.get('/siteMaintenance',function(req,res){ res.redirect('/siteMaintenance/list') })

//Episode Maintenance Page
app.post('/episodeMaintenance/list',routes.episodeMaintenance.listAction)
app.get('/episodeMaintenance/list',routes.episodeMaintenance.list)
app.get('/episodeMaintenance',function(req,res){ res.redirect('/episodeMaintenance/list') })

//User Management page
app.post('/user/list',routes.user.listAction)
app.get('/user/list',routes.user.list)
app.get('/user',function(req,res){ res.redirect('/user/list') })

//imports page
app.get('/oose/list',routes.oose.list)
app.post('/oose/list',routes.oose.listAction)
app.get('/oose',function(req,res){ res.redirect('/oose/list') })

//home page
app.get('/',routes.index)


/**
 * Start embed system
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
 * Stop embed system
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
    'animegg:admin:worker',
    function(done){
      exports.start(done)
    },
    function(done){
      exports.stop(done)
    }
  )
}
