'use strict';


/**
 * Exporting the model
 * @param {object} sequelize
 * @param {object} DataTypes
 * @return {object}
 */
module.exports = function(sequelize,DataTypes) {
  return sequelize.define('Hideout',{
      key: {
        type: DataTypes.STRING,
        allowNull: false
      },
      value: {
        type: DataTypes.TEXT,
        allowNull: true
      }
    },{
      indexes: [
        {
          name: 'key_unique',
          unique: true,
          method: 'BTREE',
          fields: ['key']
        }
      ]
    }
  )
}
