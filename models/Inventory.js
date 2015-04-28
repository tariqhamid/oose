'use strict';


/**
 * Exporting the model
 * @param {object} sequelize
 * @param {object} DataTypes
 * @return {object}
 */
module.exports = function(sequelize,DataTypes) {
  return sequelize.define('Inventory',{
      sha1: {
        type: DataTypes.CHAR(40),
        allowNull: false
      },
      mimeExtension: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: 'bin'
      },
      mimeType: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: 'application/octet-stream'
      }
    },{
      indexes: [
        {
          name: 'inventory_sha1_unique',
          unique: true,
          method: 'BTREE',
          fields: ['sha1','StoreId','PrismId']
        },
        {
          name: 'inventory_mimeExtension_index',
          method: 'BTREE',
          fields: ['mimeExtension']
        },
        {
          name: 'inventory_mimeType_index',
          method: 'BTREE',
          fields: ['mimeType']
        }
      ]
    }
  )
}
