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
      {email: {like: '%' + search + '%'}},
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
      req.flash('success','Removed user(s) successfully')
      res.redirect('/user')
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}
