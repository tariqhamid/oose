'use strict';
var list = require('../../helpers/list')
var sequelize = require('../../helpers/sequelize')()
var moment = require('moment')

var Episode = sequelize.models.Episode
var Show = sequelize.models.Show
var Video = sequelize.models.Video


/**
 * Create episode
 * @param {object} req
 * @param {object} res
 * @return {*}
 */
exports.create = function(req,res){
  Show.find(req.query.show)
    .then(function(show){
      if(!show) throw new Error('Show not found')
      res.render('episode/create',{show: show})
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}


/**
 * Edit episode
 * @param {object} req
 * @param {object} res
 * @return {*}
 */
exports.edit = function(req,res){
  Episode.find({
    where: {id: req.query.id},
    include: [Show,Video]
  })
    .then(function(episode){
      if(!episode) throw new Error('Could not find episode')
      res.render('episode/edit',{episode: episode})
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}


/**
 * Remove episode
 * @param {object} req
 * @param {object} res
 * @return {*}
 */
exports.remove = function(req,res){
  list.remove(Episode,req.body.id)
    .then(function(){
      req.flash('success','Episode(s) removed successfully')
      res.redirect('/show/edit?id=' + req.body.show)
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}


/**
 * Save Episode
 * @param {object} req
 * @param {object} res
 * @return {*}
 */
exports.save = function(req,res){
  var data = req.body
  var show, episode
  Show.find(data.show)
    .then(function(result){
      if(!result) throw new Error('Show not found')
      show = result
      return Episode.findOrCreate({
        where: {
          id: data.id
        },
        defaults: {
          title: data.title,
          uri: data.uri || show.title + ' episode ' + data.number,
          number: data.number
        }
      })
    })
    .spread(function(result,created){
      if(!result) throw new Error('No episode created or found')
      episode = result
      if(created) return episode.setShow(show)
    })
    .then(function(){
      if(data.title) episode.title = data.title
      if(data.uri) episode.uri = data.uri
      if(data.description) episode.description = data.description
      if(data.number) episode.number = data.number
      if(data.numberLabel) episode.numberLabel = data.numberLabel
      if(data.releaseDate) episode.releaseDate = moment.utc(data.releaseDate,'MM-DD-YYYY HH:mm:ss')
      if(data.preview) episode.preview = data.preview
      if(data.metaDescription) episode.metaDescription = data.metaDescription
      if(data.metaKeywords) episode.metaKeywords = data.metaKeywords
      if(data.maintenanceMessage) episode.maintenanceMessage = data.maintenanceMessage
      episode.active = !!data.active
      return episode.save()
    })
    .then(function(){
      req.flash('success','Episode saved')
      res.redirect('/episode/edit?id=' + episode.id)
    })
    .catch(function(err){
      console.trace(err)
      res.render('error',{error: err})
    })
}
