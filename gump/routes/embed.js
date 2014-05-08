'use strict';
var fs = require('fs')
  , async = require('async')
  , logger = require('../../helpers/logger').create('gump:embed')
  , Embed = require('../models/embed').model


/**
 * API Embed Details
 * @param {object} req
 * @param {object} res
 */
exports.apiDetails = function(req,res){
  var embed
  async.series(
    [
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
}


/**
 * Render embed object display
 * @param {object} req
 * @param {object} res
 */
exports.render = function(req,res){
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
}
