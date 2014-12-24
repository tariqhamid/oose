'use strict';
var sequelize = require('../helpers/sequelize')()
var UserError = require('../../helpers/UserError')

var config = require('../../config')

var Master = sequelize.models.Master
var Prism = sequelize.models.Prism


/**
 * Prism list
 * @param {object} req
 * @param {object} res
 */
exports.list = function(req,res){
  Master.find({where: {domain: config.domain}, include: [Prism]})
    .then(function(result){
      res.json({prism: result.Prisms || []})
    })
}


/**
 * Prism find
 * @param {object} req
 * @param {object} res
 */
exports.find = function(req,res){
  var data = req.body
  Prism.find({where: {name: data.name}})
    .then(function(result){
      if(!result) throw new UserError('No prism instance found')
      res.json(result.dataValues)
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Create Prism
 * @param {object} req
 * @param {object} res
 */
exports.create = function(req,res){
  var data = req.body
  Master.find({where: {domain: config.domain}})
    .then(function(result){
      if(!result) throw new UserError('Could not find master record')
      return Prism.create({
        name: data.name,
        site: data.site,
        zone: data.zone,
        host: data.host,
        port: data.port,
        MasterId: result.id
      })
    })
    .then(function(result){
      res.json({success: 'Prism instance created', id: result.id})
    })
    .catch(sequelize.ValidationError,function(err){
      res.json({error: sequelize.validationErrorToString(err)})
    })
    .catch(sequelize.UniqueConstraintError,function(){
      res.json({error: 'Prism instance already exists'})
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Update an instance
 * @param {object} req
 * @param {object} res
 */
exports.update = function(req,res){
  var data = req.body
  Prism.find({
    where: {name: data.name}
  })
    .then(function(result){
      if(!result) throw new UserError('No prism instance found for update')
      if(data.site) result.site = data.site
      if(data.zone) result.zone = data.zone
      if(data.host) result.host = data.host
      if(data.port) result.port = data.port
      return result.save()
    })
    .then(function(){
      res.json({success: 'Prism instance updated'})
    })
    .catch(sequelize.ValidationError,function(err){
      res.json({error: sequelize.validationErrorToString(err)})
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Remove prism instance
 * @param {object} req
 * @param {object} res
 */
exports.remove = function(req,res){
  var data = req.body
  Prism.destroy({where: {name: data.name}})
    .then(function(count){
      res.json({success: 'Prism instance removed', count: count})
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}
