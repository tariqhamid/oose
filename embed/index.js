'use strict';
var express = require('express')
  , app = express()
  , server = require('http').createServer(app)
  , fs = require('fs')
  , async = require('async')
  , config = require('../config')
  , logger = require('../helpers/logger')
  , Embed = require('./models/embed').model
  , running = false

app.set('views',__dirname + '/views')
app.set('view engine','jade')

app.use(express.static(__dirname + '/public'))
app.use(express.urlencoded())

var apiAuth = function(req,done){
  if(!req.query.secret){
    return done('API Auth Failed: no secret provided')
  } else if(config.get('embed.secrets').indexOf(req.query.secret) < 0){
    return done('API Auth Failed: invalid secret')
  } else {
    done()
  }
}

//get details about an embed object
app.get('/api/details/:handle',function(req,res){
  var embed
  async.series(
    [
      function(next){
        apiAuth(req,function(err){
          if(err) return next({code: 401, message: err})
          next()
        })
      },
      function(next){
        Embed.findOne({handle: req.params.handle},function(err,result){
          if(err){
            logger.warn('Error looking up embed object: ' + err.message)
            return next({code: 500, message: err.message})
          }
          if(!result) return next({code: 404, message: 'Embed object not found'})
          embed = result
          next()
        })
      }
    ],
    function(err){
      if(err){
        res.status(err.code || 500)
        res.json({
          status: 'error',
          code: err.code,
          message: err.message
        })
      } else {
        res.json({
          status: 'ok',
          code: 0,
          embed: embed.toJSON()
        })
      }
    }
  )
})

//remove embed object
app.get('/api/remove/:handle',function(req,res){
  async.series(
    [
      function(next){
        apiAuth(req,function(err){
          if(err) return next({code: 401, message: err})
          next()
        })
      },
      function(next){
        Embed.findOneAndRemove({handle: req.params.handle},function(err){
          if(err){
            logger.warn('Error removing embed object: ' + err.message)
            return next({code: 500, message: 'There was an error accessing the backend'})
          }
          next()
        })
      }
    ],
    function(err){
      if(err){
        res.status(err.code || 500)
        res.json({
          status: 'error',
          code: err.code,
          message: err.message
        })
      }
      else{
        res.json({
          status: 'ok',
          code: 0,
          message: 'Embed object removed successfully'
        })
      }
    }
  )
})

//create new embed object
app.post('/api/create',function(req,res){
  var embed, handle
  async.series(
    [
      function(next){
        apiAuth(req,function(err){
          if(err) return next({code: 401, message: err})
          next()
        })
      },
      function(next){
        handle = Embed.generateHandle()
        embed = new Embed()
        embed.handle = handle
        embed.title = req.body.title || 'Embed'
        embed.keywords = req.body.keywords || 'Embed'
        embed.media.preview = req.body.preview || []
        embed.media.video = req.body.video || []
        embed.save(function(err){
          if(err){
            logger.warn('Error creating embed object: ' + err.message)
            return next({code: 500,message: 'There was an error accessing the backend'})
          }
          next()
        })
      }
    ],
    function(err){
      if(err){
        res.status(err.code || 500)
        res.json({
          status: 'error',
          code: err.code,
          message: err.message
        })
      }
      else{
        res.json({
          status: 'ok',
          code: 0,
          message: 'Embed object created successfully',
          embed: embed.toJSON()
        })
      }
    }
  )
})

//show embed object
app.get('/:handle',function(req,res){
  Embed.findOne({handle: req.params.handle},function(err,embed){
    if(err){
      res.status(500)
      res.send('There was an error accessing the back end.')
      logger.warn('Error looking up embed object: ' + err.message)
    } else if(!embed){
      res.status(404)
      res.send('Embed object not found')
    } else if(!fs.existsSync(__dirname + '/views/' + embed.template)){
      res.status(500)
      res.send('Embed template doesnt exist')
    } else {
      res.render(
        embed.template,
        {
          media: embed.media,
          title: embed.title,
          keywords: embed.keywords
        }
      )
    }
  })
})


/**
 * Start server
 * @param {function} done
 */
exports.start = function(done){
  if(config.get('embed.secrets').length > 1){
    logger.warn('No embed secrets defined, API will be unusable')
  }
  server.listen(config.get('embed.port'),config.get('embed.host'),function(err){
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
