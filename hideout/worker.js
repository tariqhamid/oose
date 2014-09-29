'use strict';
var async = require('async')
var basicAuth = require('basic-auth')
var bodyParser = require('body-parser')
var express = require('express')
var worker = require('infant').worker
var mongoose = require('mongoose')

var app = express()
var server = require('http').createServer(app)

var Hideout = require('../models/hideout').model

var config = require('../config')

var running = false

app.use(function(req,res,next){
  var username = config.hideout.user
  var password = config.hideout.password
  if(!username || !password){
    res.status(500).end('Missing username and/or password')
  }
  function unauthorized(res){
    res.set('WWW-Authenticate','Basic realm=Authorization Required')
    return res.status(401).end()
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

app.use(bodyParser.json())

app.post('/set',function(req,res){
  async.series(
    [
      //validate input
      function(next){
        if(!req.body.key) return next('No key defined')
        if(!req.body.value) return next('No value defined')
        next()
      },
      //see if the key already exists
      function(next){
        Hideout.count({key: req.body.key},function(err,count){
          if(err) return next(err.message)
          if(count > 0) return next('Key already exists')
          next()
        })
      },
      //create the record and insert the content
      function(next){
        var doc = new Hideout()
        doc.key = req.body.key
        doc.value = req.body.value
        doc.save(function(err){
          if(err) return next(err.message)
          next()
        })
      }
    ],
    function(err){
      if(err){
        res.json({
          code: 1,
          status: 'error',
          message: err
        })
        return
      }
      res.json({code: 0, status: 'ok', message: 'Stored successfully'})
    }
  )
})

app.post('/get',function(req,res){
  var doc
  async.series(
    [
      //validate input
      function(next){
        if(!req.body.key) return next('No key provided')
        next()
      },
      //try to get key
      function(next){
        Hideout.findOne({key: req.body.key},function(err,result){
          if(err) return next(err.message)
          if(!result) return next('No record found')
          doc = result
          next()
        })
      }
    ],
    function(err){
      if(err){
        res.json({
          code: 1,
          status: 'error',
          message: err
        })
        return
      }
      res.json({
        code: 0,
        status: 'ok',
        message: 'Found object',
        key: doc.key,
        value: doc.value
      })
    }
  )
})

app.post('/exists',function(req,res){
  var exists
  async.series(
    [
      //validate input
      function(next){
        if(!req.body.key) return next('No key provided')
        next()
      },
      //check if key exists
      function(next){
        Hideout.count({key: req.body.key},function(err,count){
          if(err) return next(err.message)
          if(0 === count) exists = false
          if(0 < count) exists = true
          next()
        })
      }
    ],
    function(err){
      if(err){
        res.json({
          code: 1,
          status: 'error',
          message: err
        })
        return
      }
      res.json({
        code: 0,
        status: 'ok',
        message: 'Request successful',
        exists: exists ? 1 : 0
      })
    }
  )
})

app.get('/',function(req,res){
  res.send('OOSE hideout')
})


/**
 * Start server
 * @param {function} done
 * @return {*}
 */
exports.start = function(done){
  async.series(
    [
      function(next){
        mongoose.connect(config.mongoose.dsn,config.mongoose.options,next)
      },
      function(next){
        server.listen(config.hideout.port,config.hideout.host,function(err){
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
    'oose:hideout:worker',
    function(done){
      exports.start(done)
    },
    function(done){
      exports.stop(done)
    }
  )
}
