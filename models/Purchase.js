'use strict';


/**
 * Exporting the model
 * @param {object} sequelize
 * @param {object} DataTypes
 * @return {object}
 */
module.exports = function(sequelize,DataTypes) {
  return sequelize.define('Purchase',{
      sha1: {
        type: DataTypes.CHAR(40),
        allowNull: false
      },
      token: {
        type: DataTypes.CHAR(64),
        allowNull: false
      },
      mimeExtension: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'bin'
      },
      mimeType: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'application/octet-stream'
      }
    },{
      indexes: [
        {
          name: 'purchase_sha1_unique',
          unique: true,
          method: 'BTREE',
          fields: ['sha1','token']
        },
        {
          name: 'purchase_token_unique',
          unique: true,
          method: 'BTREE',
          fields: ['token']
        },
        {
          name: 'purchase_mimeExtension_index',
          method: 'BTREE',
          fields: ['mimeExtension']
        },
        {
          name: 'purchase_mimeType_index',
          method: 'BTREE',
          fields: ['mimeType']
        }
      ]
    }
  )
}
