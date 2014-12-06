'use strict';
var sequelize = require('../helpers/sequelize')()
var UserError = require('../helpers/UserError')

var Memory = sequelize.models.Memory


/**
 * Create an object
 * @param {object} req
 * @param {object} res
 */
exports.create = function(req,res){
  var data = req.body
  Memory.count({where: {name: data.name}})
    .then(function(count){
      if(count > 0) throw new UserError('Name already exists')
      var doc = Memory.build({
        name: data.name,
        value: data.value
      })
      return doc.save()
    })
    .then(function(result){
      res.json({success: 'Object created', id: result.id})
    })
    .catch(UserError,function(err){
      res.json({error: err})
    })
}


/**
 * Find an object
 * @param {object} req
 * @param {object} res
 */
exports.find = function(req,res){
  var data = req.body
  Memory.find({where: {name: data.name}})
    .then(function(result){
      if(!result) throw new UserError('Object not found')
      res.json(result)
    })
    .catch(UserError,function(err){
      res.json({error: err})
    })
}


/**
 * Check if an object exists
 * @param {object} req
 * @param {object} res
 */
exports.exists = function(req,res){
  var data = req.body
  Memory.count({where: {name: data.name}})
    .then(function(count){
      if(count > 0) res.json({success: 'Result found', exists: true})
      else res.json({success: 'Result not found', exists: false})
    })
}


/**
 * Update an object
 * @param {object} req
 * @param {object} res
 */
exports.update = function(req,res){
  var data = req.body
  Memory.find({where: {name: data.name}})
    .then(function(result){
      if(!result) throw new UserError('Object not found')
      if(data.value) result.value = data.value
      return result.save()
    })
    .then(function(){
      res.json({success: 'Object updated'})
    })
    .catch(sequelize.ValidationError,function(err){
      res.json({error: sequelize.validationErrorToString(err)})
    })
    .catch(UserError,function(err){
      res.json({error: err})
    })
}


/**
 * Remove key
 * @param {object} req
 * @param {object} res
 */
exports.remove = function(req,res){
  var data = req.body
  Memory.destroy({where: {name: data.name}})
    .then(function(count){
      res.json({success: 'Object removed', count: count})
    })
}
