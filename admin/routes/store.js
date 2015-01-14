'use strict';
var list = require('../../helpers/list')
var sequelize = require('../../helpers/sequelize')()

var Store = sequelize.models.Store
var Prism = sequelize.models.Prism


/**
 * Create Store
 * @param {object} req
 * @param {object} res
 * @return {*}
 */
exports.create = function(req,res){
  Prism.find(req.query.prism)
    .then(function(prism){
      if(!prism) throw new Error('Prism not found')
      res.render('store/create',{prism: prism})
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}


/**
 * Edit Store
 * @param {object} req
 * @param {object} res
 * @return {*}
 */
exports.edit = function(req,res){
  Store.find({
    where: {id: req.query.id},
    include: [Prism]
  })
    .then(function(store){
      if(!store) throw new Error('Could not find store')
      res.render('store/edit',{store: store})
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}


/**
 * Remove store
 * @param {object} req
 * @param {object} res
 * @return {*}
 */
exports.remove = function(req,res){
  list.remove(Store,req.body.id)
    .then(function(){
      req.flash('success','Store(s) removed successfully')
      res.redirect('/prism/edit?id=' + req.body.prism)
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}


/**
 * Save Store
 * @param {object} req
 * @param {object} res
 * @return {*}
 */
exports.save = function(req,res){
  var data = req.body
  var prism, store
  Store.find(data.prism)
    .then(function(result){
      if(!result) throw new Error('Prism not found')
      prism = result
      return Store.findOrCreate({
        where: {
          id: data.id
        },
        defaults: {
          name: data.name,
          port: data.port || '',
          host: data.host || ''
        }
      })
    })
    .spread(function(result,created){
      if(!result) throw new Error('No store created or found')
      store = result
      if(created) return store.setPrism(prism)
    })
    .then(function(){
      if(data.name) store.name = data.name
      if(data.port) store.port = data.port
      if(data.host) store.host = data.host
      return store.save()
    })
    .then(function(){
      req.flash('success','Store saved')
      res.redirect('/store/edit?id=' + store.id)
    })
    .catch(function(err){
      console.trace(err)
      res.render('error',{error: err})
    })
}
