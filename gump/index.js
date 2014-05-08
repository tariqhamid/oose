'use strict';
var express = require('express')
  , app = express()
  , config = require('../config')
  , server = require('http').createServer(app)
  , routes = require('./routes')
  , busboy = require('connect-busboy')

var running = false

app.locals.pretty = true
app.locals.version = config.get('version')

app.set('views',__dirname + '/views')
app.set('view engine','jade')

app.use(express.static(__dirname + '/public'))
app.use(express.urlencoded())
app.use(busboy())

//routing
app.post('/upload',routes.upload)
app.get('/embed/:handle',routes.embed.render)
app.get('/api/embedDetails/:handle',routes.embed.apiDetails)
app.get('/',routes.index)


/**
 * Start server
 * @param {function} done
 */
exports.start = function(done){
  server.listen(config.get('gump.port'),config.get('gump.host'),function(err){
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
