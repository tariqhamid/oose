'use strict';
var moment = require('moment')
var Password = require('node-password').Password

var config = require('../../config')


/**
 * Exporting the model
 * @param {object} sequelize
 * @param {object} DataTypes
 * @return {object}
 */
module.exports = function(sequelize,DataTypes) {
  return sequelize.define('UserSession',{
      token: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          len: [64,64]
        }
      },
      expires: {
        type: DataTypes.DATE,
        allowNull: false
      },
      ip: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          is: /^[0-9a-f\.:]+$/
        }
      },
      data: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: '{}'
      }
    },
    {
      indexes: [
        {
          name: 'token_unique',
          unique: true,
          method: 'BTREE',
          fields: ['token']
        },
        {
          name: 'token_ip_index',
          unique: false,
          method: 'BTREE',
          fields: ['token','ip']
        }
      ],
      hooks: {
        /**
         * Before doc validation
         * @param {Sequelize} session
         * @param {function} next
         */
        beforeValidate: function(session,options,next){
          if(!session.expires){
            var expires = moment.utc()
            expires.add(config.master.user.sessionLife,'seconds')
            session.expires = expires.toDate()
          }
          next(null,session)
        }
      },
      classMethods: {
        /**
         * Generate a token
         * @return {string}
         */
        generateToken: function(){
          return new Password({length: 64, special: false}).toString()
        }
      }
    }
  )
}
