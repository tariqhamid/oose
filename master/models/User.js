'use strict';
var bcrypt = require('bcrypt')
var P = require('bluebird')
var Password = require('node-password').Password

var UserError = require('../../helpers/UserError')

//make some promises
P.promisifyAll(bcrypt)


/**
 * Exporting the model
 * @param {object} sequelize
 * @param {object} DataTypes
 * @return {object}
 */
module.exports = function(sequelize,DataTypes) {
  return sequelize.define('User',{
      username: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          is: /^[a-z0-9\-]+$/,
          min: 3,
          max: 32
        }
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false,
        set: function(v){
          //dont re-encrypt crypted passswords
          if(v.match(/^\$2a\$12\$/)) return this.setDataValue('password',v)
          return this.setDataValue(
            'password',
            bcrypt.hashSync(v,bcrypt.genSaltSync(12)))
        }
      },
      active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      dateSeen: {
        type: DataTypes.DATE,
        allowNull: true
      },
      dateFail: {
        type: DataTypes.DATE,
        allowNull: true
      },
      failIP: {
        type: DataTypes.STRING,
        allowNull: true
      },
      failReason: {
        type: DataTypes.STRING,
        allowNull: true
      }
    },
    {
      indexes: [
        {
          name: 'username_unique',
          unique: true,
          method: 'BTREE',
          fields: ['username']
        },
        {
          name: 'active_index',
          method: 'BTREE',
          fields: [{attribute: 'active', order: 'DESC'}]
        },
        {
          name: 'dateSeen_index',
          method: 'BTREE',
          fields: [{attribute: 'dateSeen', order: 'DESC'}]
        },
        {
          name: 'dateFail_index',
          method: 'BTREE',
          fields: [{attribute: 'dateFail', order: 'DESC'}]
        }
      ],
      classMethods: {
        /**
         * Generate a password
         * @return {string}
         */
        generatePassword: function(){
          return new Password({length: 64}).toString()
        },
        /**
         * Login
         * @param {string} username
         * @param {string} password
         * @param {string} ip
         * @return {P}
         */
        login: function(username,password,ip){
          var sequelize = require('../helpers/sequelize')()
          var User = sequelize.models.User
          var now = new Date()
          var user
          return User.find({where: {username: username}})
            .then(function(result){
              if(!result) throw new UserError('No user found')
              if(!result.active) throw new UserError('User inactive')
              //globalize staff
              user = result
              //verify password
              return bcrypt.compareAsync(password,user.getDataValue('password'))
            })
            .then(function(match){
              if(!match) throw new UserError('Invalid password')
              return user.updateAttributes({dateSeen: now})
            })
            .then(function(){
              //success return our user
              return user
            })
            .catch(UserError,function(err){
              if(user){
                user.updateAttributes({
                  dateFail: now,
                  failReason: err.message,
                  failIP: ip || 'unknown'
                })
                  .then(function(){
                    throw err
                  })
              } else {
                throw err
              }
            })
        }
      }
    }
  )
}
