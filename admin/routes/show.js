'use strict';
var P = require('bluebird')
var moment = require('moment')
var validator = require('validator')

var list = require('../../helpers/list')
var sequelize = require('../../helpers/sequelize')()
var serveImport = require('../../helpers/serveImport')

var Show = sequelize.models.Show
var Media = sequelize.models.Media
var MediaImport = sequelize.models.MediaImport
var ShowReleaseSchedule = sequelize.models.ShowReleaseSchedule
var Tag = sequelize.models.Tag


/**
 * List shows
 * @param {object} req
 * @param {object} res
 */
exports.list = function(req,res){
  var limit = parseInt(req.query.limit,10) || 10
  var start = parseInt(req.query.start,10) || 0
  var search = req.query.search || ''
  if(start < 0) start = 0
  Show.findAndCountAll({
    where: sequelize.or(
      {title: {like: '%' + search + '%'}},
      {altTitles: {like: '%' + search + '%'}}
    ),
    offset: start,
    limit: limit,
    order: ['sortLetter','title']
  })
    .then(function(result){
      res.render('show/list',{
        page: list.pagination(start,result.count,limit),
        count: result.count,
        search: search,
        limit: limit,
        list: result.rows
      })
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}


/**
 * List actions
 * @param {object} req
 * @param {object} res
 */
exports.listAction = function(req,res){
  list.remove(Show,req.body.remove)
    .then(function(){
      req.flash('success','Show(s) removed successfully')
      res.redirect('/show/list')
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}


/**
 * Create show
 * @param {object} req
 * @param {object} res
 */
exports.create = function(req,res){
  res.render('show/create')
}


/**
 * Edit show
 * @param {object} req
 * @param {object} res
 */
exports.edit = function(req,res){
  var show
  Show.find({where: {id: req.query.id}, include: [Tag,ShowReleaseSchedule]})
    .then(function(result){
      if(!result) throw new Error('Show not found')
      show = result
      return show.getEpisodes({order: [['number','DESC']]})
    })
    .then(function(result){
      show.ShowReleaseSchedules.push({day: '', hour: -1, minute: -1})
      show.tags = []
      for(var i = 0; i<show.Tags.length; i++)
        show.tags.push(show.Tags[i].tag)
      res.render('show/edit',{
        episodes: result,
        show: show
      })
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}


/**
 * Save show
 * @param {object} req
 * @param {object} res
 */
exports.save = function(req,res){
  var data = req.body
  Show.find(data.id)
    .then(function(show){
      if(!show) show = Show.build()
      if(data.title) show.title = data.title
      if(data.uri) show.uri = data.uri
      if(data.sortLetter) show.sortLetter = data.sortLetter
      if(data.altTitles) show.altTitles = data.altTitles
      if(data.releaseDate) show.releaseDate = moment.utc(data.releaseDate,'MM-DD-YYYY')
      if(data.description) show.description = data.description
      if(data.popularity) show.popularity = data.popularity
      if(data.metaDescription) show.metaDescription = data.metaDescription
      if(data.metaKeywords) show.metaKeywords = data.metaKeywords
      show.ongoing = !!data.ongoing
      show.new = !!data.new
      show.featured = !!data.featured
      show.active = !!data.active
      if(!show.uri) show.uri = show.title
      return P.all([
        show.save(),
        show.saveTags(data.tags),
        show.saveReleaseSchedule(
          data.releaseScheduleDay,
          data.releaseScheduleHour,
          data.releaseScheduleMinute
        )
      ])
    })
    .then(function(results){
      req.flash('success','Show Saved')
      res.redirect('/show/edit?id=' + results[0].id)
    })
    .catch(function(err){
      console.trace(err)
      res.render('error',{error: err})
    })
}


/**
 * Import thumbnail
 * @param {object} req
 * @param {object} res
 */
exports.importThumbnail = function(req,res){
  Show.find(req.query.id)
    .then(function(show){
      res.render('show/importThumbnail',{show: show})
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}


/**
 * Import thumbnail action
 * @param {object} req
 * @param {object} res
 */
exports.importThumbnailAction = function(req,res){
  var url = req.body.url
  var show
  var handle
  Show.find(req.body.id)
    .then(function(result){
      if(!result) throw new Error('No show found')
      if(!validator.isURL(url))
        throw new Error('No url provided')
      show = result
      return serveImport.thumbnail({url: url})
        .then(function(result){
          if(!result) throw new Error('Failed to get shredder job handle')
          handle = result
          var medium
          return Media.findOrCreate({
            where: {
              ShowId: show.id
            },
            defaults: {
              sourceUrl: url,
              sourceName: 'HTTP',
              type: 'thumbnail',
              quality: 'image'
            }
          })
            .spread(function(result,created){
              medium = result
              var promises = []
              promises.push(MediaImport.findOrCreate({
                where: {
                  MediumId: medium.id
                },
                defaults: {
                  handle: handle
                }
              }))
              if(created) promises.push(medium.setShow(show))
              return P.all(promises)
            })
            .then(function(results){
              var created = results[0][1]
              var mediaImport = results[0][0]
              var promises = []
              mediaImport.handle = handle
              promises.push(mediaImport.save())
              if(created) promises.push(mediaImport.setMedium(medium))
              return P.all(promises)
            })
        })
    })
    .then(function(){
      req.flash('success','Thumbnail successfully queued for import')
      res.redirect('/show/edit?id=' + show.id)
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}
