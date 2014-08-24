'use strict';
var Table = require('cli-table')
var program = require('commander')
var mongoose = require('mongoose')

var logger = require('../helpers/logger').create('gump:user')
var User = require('../models/user').model

var config = require('../config')

mongoose.connect(config.mongoose.dsn,config.mongoose.options,function(err){
  if(err) throw err
  //create
  program
    .command('create')
    .option('-e, --email <s>','Email')
    .option('-p, --password <s>','Password')
    .option('-a, --admin','Mark as admin')
    .description('Create new user')
    .action(function(opts){
      if(!opts.email || !opts.password){
        throw new Error('Email and password are required')
      }
      var doc = new User({
        email: opts.email,
        password: opts.password,
        admin: opts.admin || false,
        active: true
      })
      doc.save(function(err){
        if(err) throw new Error('Failed to create user: ' + err)
        logger.info('User created!')
        process.exit()
      })
    })
  //update
  program
    .command('update')
    .option('-e, --email <s>','Email used to look up user')
    .option('-E, --newEmail <s>','New email address if its being changed')
    .option('-p, --password <s>','Password')
    .option('-a, --admin','Mark as admin')
    .description('Update existing user')
    .action(function(opts){
      if(!opts.email) throw new Error('Email is required')
      User.findOne({email: opts.email},function(err,doc){
        if(err) throw new Error('Could not lookup user to edit ' + err)
        if(opts.newEmail) doc.email = opts.newEmail
        if(opts.password) doc.password = opts.password
        doc.admin = opts.admin || false
        doc.save(function(err){
          if(err) throw new Error('Could not save user: ' + err)
          logger.info('User updated successfully!')
          process.exit()
        })
      })
    })
  //remove
  program
    .command('remove')
    .option('-e, --email <s>','Email of user to remove')
    .description('Remove user')
    .action(function(opts){
      if(!opts.email) throw new Error('Email is required... exiting')
      User.findOne({email: opts.email},function(err,doc){
        if(err) throw new Error('Could not lookup user to remove ' + err)
        doc.remove(function(err){
          if(err){
            logger.error('Could not remove user: ' + err)
          } else {
            logger.info('User removed successfully!')
          }
          process.exit()
        })
      })
    })
  //list
  program
    .command('list')
    .description('List users')
    .action(function(){
      User.list({},function(err,count,results){
        var table = new Table({
          head: ['Email','Admin','Active']
        })
        if(results instanceof Array){
          results.forEach(function(row){
            table.push([row.email,row.admin,row.active ? 'Yes' : 'No'])
          })
        }
        console.log(table.toString())
        process.exit()
      })
    })
  program.version(config.version)
  var cli = program.parse(process.argv)
  if(!cli.args.length) program.help()
})
