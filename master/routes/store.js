'use strict';
var sequelize = require('../helpers/sequelize')()
var UserError = require('../../helpers/UserError')

var Prism = sequelize.models.Prism
var Store = sequelize.models.Store


/**
 * Store list
 * @param {object} req
 * @param {object} res
 */
exports.list = function(req,res){
  var data = req.body
  if(!data.prism){
    Store.findAll({include: [Prism]})
      .then(function(results){
        res.json({store: results || []})
      })
  } else {
    Prism.find({where: {name: data.prism}, include: [Store]})
      .then(function(result){
        res.json({store: result.Stores || []})
      })
  }
}


/**
 * Store find
 * @param {object} req
 * @param {object} res
 */
exports.find = function(req,res){
  var data = req.body
  Store.find({where: {name: data.name}})
    .then(function(result){
      if(!result) throw new UserError('No store instance found')
      res.json(result.dataValues)
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Create Store
 * @param {object} req
 * @param {object} res
 */
exports.create = function(req,res){
  var data = req.body
  Prism.find({where: {name: data.prism}})
    .then(function(result){
      if(!result) throw new UserError('Could not find prism')
      return Store.create({
        name: data.name,
        ip: data.ip,
        port: data.port,
        PrismId: result.id
      })
    })
    .then(function(result){
      res.json({success: 'Store instance created', id: result.id})
    })
    .catch(sequelize.ValidationError,function(err){
      res.json({error: sequelize.validationErrorToString(err)})
    })
    .catch(sequelize.UniqueConstraintError,function(){
      res.json({error: 'Store instance already exists'})
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
  Store.find({
    where: {name: data.name}
  })
    .then(function(result){
      if(!result) throw new UserError('No store instance found for update')
      if(data.ip) result.ip = data.ip
      if(data.port) result.port = data.port
      return result.save()
    })
    .then(function(){
      res.json({success: 'Store instance updated'})
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
  Store.destroy({where: {name: data.name}})
    .then(function(count){
      res.json({success: 'Store instance removed', count: count})
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}
