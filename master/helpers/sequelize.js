'use strict';
var fs = require('fs')
var Sequelize = require('sequelize')

var config = require('../../config')

var inst
var modelPath = __dirname + '/../models'


/**
 * Setup the database relationships
 * @param {Sequelize} s
 */
var keyMapping = function(s){
  //load models with keys
  var Master = s.models.Master
  var Prism = s.models.Prism
  var Store = s.models.Store
  var User = s.models.Store
  var UserSession = s.models.UserSession
  //parents
  Master.hasMany(Prism)
  Prism.hasMany(Store)
  User.hasMany(UserSession)
  //children
  Store.belongsTo(Prism,{onDelete: 'CASCADE', onUpdate: 'CASCADE'})
  Prism.belongsTo(Master,{onDelete: 'CASCADE', onUpdate: 'CASCADE'})
  UserSession.belongsTo(User,{onDelete: 'CASCADE', onUpdate: 'CASCADE'})
}


/**
 * Create the Sequelze instance
 * @return {Sequelize}
 */
var createInst = function(){
  //configure the instance for connection
  var inst = new Sequelize(
    config.mysql.name,
    config.mysql.user,
    config.mysql.password,
    {
      host: config.mysql.host,
      port: config.mysql.port,
      logging: config.mysql.logging || false
    }
  )
  //load models automatically from the fs
  fs.readdirSync(modelPath).forEach(function(file){
    if('.' === file || '.' === file) return
    inst.import(modelPath + '/' + file)
  })
  //setup relationship mapping
  keyMapping(inst)
  inst.doConnect = function(){
    var that = this
    return that.authenticate().then(function(){return that.sync()})
  }
  inst.validationErrorToString = function(err){
    var str = ''
    for(var i = 0; i < err.errors.length; i++){
      str += err.errors[i].message + ' on ' + err.errors[i].path + '. '
    }
    return str
  }
  return inst
}


/**
 * Export the singleton
 * @return {Sequelize}
 */
module.exports = function(){
  if(inst) return inst
  inst = createInst()
  return inst
}
