'use strict';
var express = require('express')
var async = require('async')
var app = express()
var config = require('../config')
var server = require('http').createServer(app)
var Hideout = require('../models/hideout').model
var logger = require('../helpers/logger').create('hideout')

var running = false

//this is needed so we can gracefully decline to start
if(config.get('hideout.user') && config.get('hideout.password'))
  app.use(express.basicAuth(config.get('hideout.user'),config.get('hideout.password')))
app.use(express.json())


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
        console.log(req.body.key)
        Hideout.count({key: req.body.key},function(err,count){
          if(err) return next(err.message)
          if(0 === count) exists = false
          if(count > 0) exists = true
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
        exists: exists ? 1: 0
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
  if(!config.get('hideout.user') || !config.get('hideout.password')){
    logger.warning('Refusing to start hideout, missing username and/or password')
    return done()
  }
  server.listen(config.get('hideout.port'),config.get('hideout.host'),function(err){
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
