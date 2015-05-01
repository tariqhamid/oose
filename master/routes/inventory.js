'use strict';
var mime = require('mime')
var oose = require('oose-sdk')

var sequelize = require('../../helpers/sequelize')()
var UserError = oose.UserError

var Inventory = sequelize.models.Inventory
var Prism = sequelize.models.Prism
var Store = sequelize.models.Store


/**
 * Create an inventory record
 * @param {object} req
 * @param {object} res
 */
exports.create = function(req,res){
  var data = req.body
  var store = {}
  //fill in mime types if we can or have to
  if(!data.mimeExtension && data.mimeType)
    data.mimeExtension = mime.extension(data.mimeType)
  if(!data.mimeType && data.mimeExtension)
    data.mimeType = mime.lookup(data.mimeExtension)
  //lookup the store and prism
  Store.find({where: {name: data.store}, include: [Prism]})
    .then(function(result){
      if(!result || !result.Prism)
        throw new UserError('Could not find store')
      store = result
      return Inventory.find({
        where: {
          sha1: data.sha1,
          StoreId: store.id,
          PrismId: store.Prism.id
        }
      })
    })
    .then(function(result){
      if(result){
        return result
      } else {
        return Inventory.create({
          sha1: data.sha1,
          mimeExtension: data.mimeExtension,
          mimeType: data.mimeType,
          StoreId: store.id,
          PrismId: store.Prism.id
        })
      }
    })
    .then(function(result){
      res.json({success: 'Inventory created', inventory: result})
    })
    .catch(UserError,function(err){
      res.status(500)
      res.json({error: err.message})
    })
}


/**
 * Find an object
 * @param {object} req
 * @param {object} res
 */
exports.find = function(req,res){
  var data = req.body
  Inventory.findAll({where: {sha1: data.sha1}})
    .then(function(result){
      if(!result) throw new UserError('Inventory not found')
      res.json(result)
    })
    .catch(UserError,function(err){
      res.json({error: err})
    })
}


/**
 * Get a feed of rows from a time stamp
 * @param {object} req
 * @param {object} res
 */
exports.feed = function(req,res){
  var data = req.body
  if(!data.start) data.start = new Date(0).toString()
  if(!data.end) data.end = new Date(((+new Date()) + 1000)).toString()
  Inventory.findAll({
    where: sequelize.and(
      {createdAt: {$gt: (new Date('' + data.start))}},
      {createdAt: {$lt: (new Date('' + data.end))}}
    ),
    include: [Store,Prism]
  })
    .then(function(result){
      res.json(result)
    })
}


/**
 * Check if an object exists
 * @param {object} req
 * @param {object} res
 */
exports.exists = function(req,res){
  var data = req.body
  Inventory.findAll({where: {sha1: data.sha1}, include: [Prism,Store]})
    .then(function(result){
      if(!result){
        res.json({
          exists: false,
          count: 0,
          ext: 'bin',
          mimeType: 'application/octet-stream',
          map: {}
        })
      } else {
        var map = {}
        for(var i = 0; i < result.length; i++){
          if(!map[result[i].Prism.name]) map[result[i].Prism.name] = {}
          map[result[i].Prism.name][result[i].Store.name] = true
        }
        res.json({
          exists: true,
          count: result.length,
          ext: result[0].mimeExtension,
          mimeType: result[0].mimeType,
          map: map
        })
      }
    })
}


/**
 * Remove key
 * @param {object} req
 * @param {object} res
 */
exports.remove = function(req,res){
  var data = req.body
  var store = {}
  Store.find({where: {name: data.store}})
    .then(function(result){
      if(!result) throw new UserError('Store not found')
      store = result
      return Inventory.destroy({where: {sha1: data.sha1, StoreId: store.id}})
    })
    .then(function(count){
      res.json({success: 'Inventory removed', count: count})
    })
    .catch(UserError,function(err){
      res.json({error: err})
    })
}
