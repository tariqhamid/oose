'use strict';
var list = require('../../helpers/list')
var Model = require('../../models/user').model


/**
 * List members (admin only)
 * @param {object} req
 * @param {object} res
 */
exports.list = function(req,res){
  if('post' === req.method.toLowerCase() && req.body.remove && req.body.remove.length){
    list.remove(Model,req.body.remove,function(err,count){
      if(err) req.flash('error','Removed ' + count + ' item(s) before removal failed ' + err)
      else {
        req.flash('success','Deleted ' + count + ' item(s)')
        res.redirect('/users')
      }
    })
  } else {
    var limit = parseInt(req.query.limit,10) || 10
    var start = parseInt(req.query.start,10) || 0
    var search = req.query.search || ''
    if(start < 0) start = 0
    Model.list({start: start, limit: limit, find: search},function(err,count,results){
      res.render('user/list',{
        page: list.pagination(start,count,limit),
        count: count,
        search: search,
        limit: limit,
        list: results
      })
    })
  }
}


/**
 * User edit/create form
 * @param {object} req
 * @param {object} res
 */
exports.form = function(req,res){
  Model.findById(req.query.id,function(err,result){
    if(err){
      req.flash('error',err)
      res.redirect('/users')
    } else{
      if(!result) result = {}
      res.render('user/form',{
        title: req.url.indexOf('edit') > 0 ? 'Edit User' : 'Create User',
        user: {
          id: req.query.id || result.id || '',
          email: req.body.email || result.email || '',
          admin: req.body.admin || result.admin || false,
          active: req.body.active || result.active || true
        }
      })
    }
  })
}


/**
 * Save user
 * @param {object} req
 * @param {object} res
 */
exports.save = function(req,res){
  Model.findById(req.body.id,function(err,doc){
    if(!doc) doc = new Model()
    doc.email = req.body.email
    if(req.body.password) doc.password = req.body.password
    doc.admin = req.body.admin ? true : false
    doc.active = req.body.active ? true : false
    doc.save(function(err){
      if(err){
        req.flash('error',err)
        exports.form(req,res)
      } else {
        req.flash('success','User saved')
        res.redirect('/users')
      }
    })
  })
}


/**
 * User login
 * @param {object} req
 * @param {object} res
 */
exports.login = function(req,res){
  if('post' === req.method.toLowerCase()){
    Model.login(req.body.email,req.body.password,function(err,user){
      if(err){
        req.flash('error',err)
        res.render('login')
      } else {
        req.session.user = user.toJSON()
        var to = '/'
        if(req.session.loginFrom){
          to = req.session.loginFrom
          delete req.session.loginFrom
        }
        res.redirect(to)
      }
    })
  } else {
    res.render('login')
  }
}


/**
 * Logout
 * @param {object} req
 * @param {object} res
 */
exports.logout = function(req,res){
  delete req.session.user
  res.redirect('/login')
}
