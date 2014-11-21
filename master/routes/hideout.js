'use strict';
var sequelize = require('../helpers/sequelize')()
var UserError = require('../helpers/UserError')

var Hideout = sequelize.models.Hideout


/**
 * Set a value
 * @param {object} req
 * @param {object} res
 */
exports.set = function(req,res){
  Hideout.count({where: {key: req.body.key}})
    .then(function(count){
      if(count > 0) throw new UserError('Key already exists')
      var doc = Hideout.build({
        key: req.body.key,
        value: req.body.value
      })
      return doc.save()
    })
    .then(function(){
      res.json({success: 'Key saved'})
    })
    .catch(UserError,function(err){
      res.json({error: err})
    })
}


/**
 * Get key
 * @param {object} req
 * @param {object} res
 */
exports.get = function(req,res){
  Hideout.find({where: {key: req.body.key}})
    .then(function(result){
      if(!result) res.json({error: 'Key not found'})
      else{
        res.json({
          key: result.key,
          value: result.value
        })
      }
    })
}


/**
 * Check if a key exists
 * @param {object} req
 * @param {object} res
 */
exports.exists = function(req,res){
  Hideout.count({where: {key: req.body.key}})
    .then(function(count){
      if(count > 0) res.json({success: 'Result found', exists: true})
      else res.json({success: 'Result not found', exists: false})
    })
}


/**
 * Update a value
 * @param {object} req
 * @param {object} res
 */
exports.update = function(req,res){
  Hideout.findOrCreate({
    where: {key: req.body.key},
    defaults: {key: req.body.key, value: req.body.value}
  })
    .then(function(hideout){
      hideout.value = req.body.value
      return hideout.save()
    })
    .then(function(){
      res.json({success: 'Key updated'})
    })
    .catch(sequelize.ValidationError,function(err){
      res.json({error: sequelize.validationErrorToString(err)})
    })
}


/**
 * Remove key
 * @param {object} req
 * @param {object} res
 */
exports.remove = function(req,res){
  Hideout.destroy({where: {key: req.body.key}})
    .then(function(){
      res.json({success: 'Key removed'})
    })
}
