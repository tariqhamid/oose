'use strict';


/**
 * Exporting the model
 * @param {object} sequelize
 * @param {object} DataTypes
 * @return {object}
 */
module.exports = function(sequelize,DataTypes) {
  return sequelize.define('Prism',{
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          is: /^[a-z0-9\-]+$/,
          min: 3,
          max: 32
        }
      },
      site: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          is: /^[a-z0-9\-]+$/,
          min: 3,
          max: 32
        }
      },
      zone: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          is: /^[a-z0-9\-]+$/,
          min: 3,
          max: 32
        }
      },
      host: {
        type: DataTypes.STRING,
        allowNull: false
      },
      port: {
        type: DataTypes.INTEGER(5).UNSIGNED,
        allowNull: false,
        validate: {
          isNumeric: true
        }
      }
    },{
      indexes: [
        {
          name: 'name_unique',
          unique: true,
          method: 'BTREE',
          fields: ['name']
        }
      ]
    }
  )
}
