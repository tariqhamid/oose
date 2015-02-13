'use strict';
var Password = require('node-password').Password


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
          name: 'user_session_token_unique',
          unique: true,
          method: 'BTREE',
          fields: ['token']
        },
        {
          name: 'user_session_token_ip_index',
          unique: false,
          method: 'BTREE',
          fields: ['token','ip']
        }
      ],
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
