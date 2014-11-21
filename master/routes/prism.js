'use strict';
var util = require('util')

var sequelize = require('../helpers/sequelize')()
var UserError = require('../helpers/UserError')

var config = require('../../config')

var Master = sequelize.models.Master
var Prism = sequelize.models.Prism


/**
 * Prism list
 * @param {object} req
 * @param {object} res
 */
exports.list = function(req,res){
  Master.findOne({where: {domain: config.domain}, include: [Prism]})
    .then(function(result){
      res.json({prisms: result.Prism || []})
    })
    .catch(function(err){
      res.json({error: util.inspect(err)})
    })
}


/**
 * Create Prism
 * @param {object} req
 * @param {object} res
 */
exports.create = function(req,res){
  var data = req.body
  var master, prism
  Master.findOne({where: {domain: config.domain}})
    .then(function(result){
      if(!result) throw new UserError('Could not find master record')
      master = result
      return Prism.create({
        name: data.name,
        site: data.site,
        zone: data.zone,
        ip: data.ip,
        port: data.port
      })
    })
    .then(function(result){
      prism = result
      return prism.setMaster(master)
    })
    .then(function(){
      res.json({success: 'Prism instance created', id: prism.id})
    })
    .catch(sequelize.ValidationError,function(err){
      res.json({error: sequelize.validationErrorToString(err)})
    })
    .catch(sequelize.UniqueConstraintError,function(){
      res.json({error: 'Prism instance already exists'})
    })
    .catch(UserError,function(err){
      res.json({error: err})
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
    where: {name: req.body.name}
  })
    .then(function(prism){
      if(data.name) prism.name = data.name
      if(data.site) prism.site = data.site
      if(data.zone) prism.zone = data.zone
      if(data.ip) prism.ip = data.ip
      if(data.port) prism.port = data.port
      return prism.save()
    })
    .then(function(){
      res.json({success: 'Prism instance updated'})
    })
    .catch(sequelize.ValidationError,function(err){
      res.json({error: sequelize.validationErrorToString(err)})
    })
}


/**
 * Remove prism instance
 * @param {object} req
 * @param {object} res
 */
exports.remove = function(req,res){
  Prism.destroy({where: {name: req.body.name}})
    .then(function(){
      res.json({success: 'Prism instance removed'})
    })
}
