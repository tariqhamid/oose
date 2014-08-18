'use strict';
var SSH2 = require('ssh2')
var path = require('path')
var async = require('async')
var shortid = require('shortid')
var EventEmitter = require('events').EventEmitter



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
  var buffer = ''
  async.eachSeries(
    cmd,
    function(cmd,next){
      client.exec(cmd,function(err,stream){
        if(err) return next(err)
        stream.setEncoding('utf-8')
        stream.on('data',function(data){
          buffer += data
        })
        stream.on('finish',function(){next()})
        stream.on('exit',function(code){
          if(code > 0) next('Failed to execute: ' + cmd)
        })
      })
    },
    function(err){
      if(err) return next(err)
      next(null,buffer)
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
        stream.setEncoding('utf-8')
        stream.on('data',function(data){
          writable.write(data)
        })
        stream.on('finish',function(){next()})
        stream.on('exit',function(code){
          if(code > 0) next('Failed to execute: ' + cmd)
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
          stream.on('close',function(){next()})
          stream.on('data',function(data){writable.write(data)})
          stream.write('export TERM=dumb\n')
          stream.write('export DEBIAN_FRONTEND=noninteractive\n')
          stream.end(command + ' && exit $?\n')
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
          stream.on('close', function() {
            next()
          })
          stream.on('data',function(data){
            writable.write(data)
          })
          stream.write('export TERM=dumb\n')
          stream.write('export DEBIAN_FRONTEND=noninteractive\n')
          stream.write(cmd + ' && exit $?\n')
          stream.end()
        })
      },
      //remove the tmpfile
      function(next){
        var cmd = '/bin/rm -f ' + tmpfile
        that.commandStream(cmd,writable,next)
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
