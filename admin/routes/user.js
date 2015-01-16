'use strict';
var list = require('../../helpers/list')
var sequelize = require('../../helpers/sequelize')()

var User = sequelize.models.User


/**
 * List users
 * @param {object} req
 * @param {object} res
 */
exports.list = function(req,res){
  var limit = +req.query.limit || 10
  var start = +req.query.start || 0
  var search = req.query.search || ''
  if(start < 0) start = 0
  User.findAndCountAll({
    where: sequelize.or(
      {username: {like: '%' + search + '%'}}
    ),
    limit: limit,
    offset: start
  })
    .then(function(result){
      res.render('user/list',{
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
 * List action
 * @param {object} req
 * @param {object} res
 */
exports.listAction = function(req,res){
  list.remove(User,req.body.remove)
    .then(function(){
      req.flash('success','User removed successfully')
      res.redirect('/user/list')
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}


/**
 * Create user member
 * @param {object} req
 * @param {object} res
 */
exports.create = function(req,res){
  res.render('user/create')
}


/**
 * User edit form
 * @param {object} req
 * @param {object} res
 */
exports.edit = function(req,res){
  User.find(req.query.id)
    .then(function(result){
      if(!result) throw new Error('User member not found')
      res.render('user/edit',{user: result})
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}


/**
 * Save User
 * @param {object} req
 * @param {object} res
 */
exports.save = function(req,res){
  var data = req.body
  User.find(data.id)
    .then(function(doc){
      if(!doc) doc = User.build()
      doc.username = data.username
      if(data.password) doc.password = data.password
      return doc.save()
    })
    .then(function(user){
      req.flash('success','User saved')
      res.redirect('/user/edit?id=' + user.id)
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}


/**
 * User login
 * @param {object} req
 * @param {object} res
 */
exports.login = function(req,res){
  res.render('login')
}


/**
 * Login action
 * @param {object} req
 * @param {object} res
 */
exports.loginAction = function(req,res){
  User.login(req.body.username,req.body.password)
    .then(function(result){
      console.log('Success')
      req.session.user = result.toJSON()
      console.log(req.session)
      res.redirect('/')
      console.log('should be redirected')
    })
    .catch(function(err){
      console.trace(err)
      req.flash('error',err)
      res.render('login')
    })
}


/**
 * User logout
 * @param {object} req
 * @param {object} res
 */
exports.logout = function(req,res){
  delete req.session.user
  res.redirect('/login')
}
