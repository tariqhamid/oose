'use strict';
var async = require('async')
var EventEmitter = require('events').EventEmitter
var path = require('path')
var SSH2 = require('ssh2')

var shortid = require('../../helpers/shortid')



/**
 * SSH Peer Helper
 * @constructor
 */
var SSH = function(){
  var that = this
  EventEmitter.call(that)
  that.client = new SSH2()
  that.client.on('error',function(err){that.emit('error',err)})
}
SSH.prototype = Object.create(EventEmitter.prototype)


/**
 * Prepare an SSH connection to a peer
 * @param {peer} peer
 * @param {string} privateKey
 * @param {function} done
 * @return {*}
 */
SSH.prototype.connect = function(peer,privateKey,done){
  var that = this
  var client = new SSH2()
  var complete = function(err){done(err)}
  client.once('error',complete)
  client.on('ready',function(){
    client.removeListener('error',complete)
    that.client = client
    done(null,that)
  })
  client.connect({
    host: peer.ip,
    port: peer.sshPort || 22,
    username: peer.sshUsername || 'root',
    privateKey: privateKey
  })
}


/**
 * Run an ssh command buffer the output
 * @param {string} cmd
 * @param {function} next
 */
SSH.prototype.commandBuffered = function(cmd,next){
  var client = this.client
  if(!(cmd instanceof Array)) cmd = [cmd]
  var commandOut = ''
  var commandErr = ''
  async.eachSeries(
    cmd,
    function(cmd,next){
      client.exec(cmd,function(err,stream){
        if(err) return next(err)
        var exitCode = 0
        var stdout = ''
        var stderr = ''
        stream.setEncoding('utf-8')
        stream.on('readable',function(){
          stdout = stdout + stream.read()
        })
        stream.stderr.on('readable',function(){
          stderr = stderr + stream.stderr.read()
        })
        stream.on('exit',function(code){ exitCode = code })
        stream.on('end',function(){
          var err = null
          if(0 !== exitCode)
            err = 'Failed to execute (' + exitCode + '): ' + cmd
          //save the buffer
          commandOut = commandOut + stdout
          commandErr = commandErr + stderr
          next(err)
        })
      })
    },
    function(err){
      next(err,commandOut,commandErr)
    }
  )
}


/**
 * Run an ssh command stream the output
 * @param {string} cmd
 * * @param {Stream.Writable} writable
 * @param {function} next
 */
SSH.prototype.commandStream = function(cmd,writable,next){
  var client = this.client
  if(!(cmd instanceof Array)) cmd = [cmd]
  async.eachSeries(
    cmd,
    function(cmd,next){
      client.exec(cmd,function(err,stream){
        if(err) return next(err)
        var exitCode
        stream.setEncoding('utf-8')
        stream.on('readable',function(){
          writable.write(stream.read())
        })
        stream.on('exit',function(code){
          exitCode = code
        })
        stream.on('end',function(){
          if(0 !== exitCode) return next('Failed to execute (' + exitCode + '): ' + cmd)
          next()
        })
      })
    },
    next
  )
}


/**
 * Run a bash script and stream the output
 * @param {string} command
 * @param {Stream.Writable} writable
 * @param {function} next
 */
SSH.prototype.commandShell = function(command,writable,next){
  var that = this
  var client = that.client
  async.series(
    [
      //execute the command
      function(next){
        client.shell(function(err,stream){
          if(err) return next(err)
          stream.setEncoding('utf-8')
          stream.on('error',function(err){next(err)})
          stream.on('end',function(){
            next()
          })
          stream.on('readable',function(){
            writable.write(stream.read())
          })
          stream.write('export TERM=dumb\n')
          stream.write('export DEBIAN_FRONTEND=noninteractive\n')
          stream.end(command + ' ; exit $?\n')
        })
      }
    ],
    next
  )
}


/**
 * Run a bash script and stream the output
 * @param {string} script
 * @param {Stream.Writable} writable
 * @param {function} next
 */
SSH.prototype.scriptStream = function(script,writable,next){
  var that = this
  var client = that.client
  var tmpfile = '/tmp/' + shortid.generate()
  async.series(
    [
      //put the file on the remote host
      function(next){
        client.sftp(function(err,sftp){
          if(err) return next(err)
          sftp.fastPut(script,tmpfile,function(err){
            if(err) return next(err)
            next()
          })
        })
      },
      //execute the script
      function(next){
        var cmd = '/bin/bash ' + tmpfile
        client.shell(function(err,stream){
          if(err) return next(err)
          stream.setEncoding('utf-8')
          stream.on('end', function(){
            next()
          })
          stream.on('readable',function(){
            var data = stream.read()
            writable.write(data)
          })
          stream.write('export TERM=dumb\n')
          stream.write('export DEBIAN_FRONTEND=noninteractive\n')
          stream.write(cmd + ' ; exit $?\n')
          //stream.end()
        })
      },
      //remove the tmpfile
      function(next){
        var cmd = '/bin/rm -f ' + tmpfile
        that.commandBuffered(cmd,next)
      }
    ],
    function(err){
      if(err) return next(err)
      next()
    }
  )
}


/**
 * Send a file to the client
 * @param {string} src file
 * @param {string} dst file
 * @param {function} next
 */
SSH.prototype.sendFile = function(src,dst,next){
  var that = this
  var client = that.client
  async.series(
    [
      //create the folder
      function(next){
        that.commandBuffered('mkdir -p ' + path.dirname(dst),function(err){
          if(err) return next(err)
          next()
        })
      },
      //put the file on the remote host
      function(next){
        client.sftp(function(err,sftp){
          if(err) return next(err)
          sftp.fastPut(src,dst,function(err){
            if(err) return next(err)
            next()
          })
        })
      }
    ],
    next
  )
}


/**
 * SSH helper
 * @type {SSH}
 */
module.exports = SSH
