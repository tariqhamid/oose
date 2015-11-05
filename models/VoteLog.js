'use strict';


/**
 * Exporting the model
 * @param {object} sequelize
 * @param {object} DataTypes
 * @return {object}
 */
module.exports = function(sequelize,DataTypes) {
  return sequelize.define('VoteLog',{
      hostId: {
        type: DataTypes.INTEGER(11).UNSIGNED,
        allowNull: false
      },
      hostType: {
        type: DataTypes.ENUM('prism','store'),
        allowNull: false,
        defaultValue: 'store'
      },
      caster: {
        type: DataTypes.STRING,
        allowNull: false
      },
      createdStamp: {
        type: DataTypes.INTEGER(11).UNSIGNED,
        allowNull: false
      }
    },{
      indexes: [
        {
          name: 'hostId_index',
          method: 'BTREE',
          fields: ['hostId']
        },
        {
          name: 'hostType_index',
          method: 'BTREE',
          fields: ['hostType']
        },
        {
          name: 'caster_index',
          method: 'BTREE',
          fields: ['caster']
        },
        {
          name: 'createdStamp_index',
          method: 'BTREE',
          fields: ['createdStamp']
        },
        {
          name: 'vote_unique',
          unique: true,
          method: 'BTREE',
          fields: ['hostId','hostType','caster']
        }
      ]
    }
  )
}
