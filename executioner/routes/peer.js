'use strict';
var Peer = require('../../models/peer').model
var dns = require('dns')
var async = require('async')
var net = require('net')
var SSH2 = require('ssh2')
var fs = require('fs')
var shortid = require('shortid')
var config = require('../../config')
var list = require('../helpers/list')
var uptimeExp = /^\d+:\d+:\d+\s+up\s+([^,]+,[^,]+),\s+\d+\s+use(r|rs),\s+load average:\s+([^\n]+)/i
var versionExp = /\s+version:\s+'([^']+)',\n/ig
var actionPeerRestart = {
  name: 'restart',
  status: 'ok',
  finalStatusSuccess: 'ok',
  finalStatusError: 'stopped',
  cmd: 'pm2 -s --no-color restart oose'
}
var actionPeerStop = {
  name: 'stop',
  status: 'stopped|ok|error',
  finalStatusSuccess: 'stopped',
  finalStatusError: 'stopped',
  cmd: 'pm2 --no-color -s delete oose'
}
var actionPeerStart = {
  name: 'start',
  status: 'stopped|error',
  finalStatusSuccess: 'ok',
  finalStatusError: 'stopped',
  cmd: 'pm2 -s --no-color start /opt/oose/processes.json'
}


/**
 * Prepare an SSH connection to a peer
 * @param {peer} peer
 * @return {SSH2}
 */
var sshConnect = function(peer){
  var client = new SSH2()
  client.doConnect = function(){
    client.connect({
      host: peer.ip,
      port: peer.sshPort || 22,
      username: peer.sshUsername || 'root',
      privateKey: fs.readFileSync(config.get('executioner.ssh.privateKey'))
    })
  }
  return client
}


/**
 * Run an ssh command stream the output
 * @param {SSH2} client
 * @param {object} res
 * @param {string} cmd
 * @param {function} next
 */
var sshStreamCommand = function(client,res,cmd,next){
  if(!(cmd instanceof Array)) cmd = [cmd]
  async.eachSeries(
    cmd,
    function(cmd,next){
      client.exec(cmd,function(err,stream){
        if(err) return next(err)
        stream.setEncoding('utf-8')
        stream.on('data',function(data){
          res.write(data)
        })
        stream.on('close',function(){
          next()
        })
        stream.on('exit',function(code){
          if(code > 0) next('Failed to execute: ' + cmd)
        })
      })
    },
    next
  )
}


/**
 * Run an ssh command buffer the output
 * @param {SSH2} client
 * @param {string} cmd
 * @param {function} next
 */
var sshBufferCommand = function(client,cmd,next){
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
        stream.on('close',function(){
          next()
        })
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
 * Run a bash script and stream the output
 * @param {SSH2} client
 * @param {res} res
 * @param {string} script
 * @param {function} next
 */
var sshStreamScript = function(client,res,script,next){
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
            res.write(data)
          })
          stream.write('export TERM=dumb\n')
          stream.write('export DEBIAN_FRONTEND=noninteractive\n')
          stream.write(cmd + ' && exit $?\n')
          stream.end()
        })
        //sshStreamCommand(client,res,cmd,next)
      },
      //remove the tmpfile
      function(next){
        var cmd = '/bin/rm -f ' + tmpfile
        sshStreamCommand(client,res,cmd,next)
      }
    ],
    function(err){
      if(err) return next(err)
      next()
    }
  )
}


/**
 * Upgrade a peer
 * @param {ObjectID} id
 * @param {Stream.Writable} writable
 * @param {function} next
 */
var peerUpgrade = function(id,writable,next){
  var peer
  async.series(
    [
      //retrieve the peer
      function(next){
        Peer.findById(id,function(err,result){
          if(err) return next(err.message)
          if(!result) return next('Could not find peer')
          peer = result
          next()
        })
      },
      //check if the peer is at the right status
      function(next){
        if(!peer.status.match(/started|stopped|error|ok/i))
          return next('Peer not ready to be upgraded, make sure it is installed')
        next()
      },
      //attempt to login to the peer with ssh
      function(next){
        var client = sshConnect(peer)
        client.on('ready',function(){
          sshStreamScript(client,writable,__dirname + '/../scripts/upgrade.sh',next)
        })
        client.on('error',function(err){
          next('Failed to connect to peer: ' + err)
        })
        client.doConnect()
      }
    ],
    function(err){
      //log this attempt
      async.series(
        [
          function(next){
            if(err){
              peer.log.push({message: err,level: 'error'})
            }
            else{
              peer.log.push({message: 'Successfully upgraded peer',level: 'success'})
            }
            peer.save(function(err){
              if(err) return next(err.message)
              next()
            })
          }
        ],
        function(error){
          if(err) return next(err)
          if(error) return next(error)
          next()
        }
      )
    }
  )
}


/**
 * Peer action (start,stop,restart)
 * @param {ObjectId} id
 * @param {object} action
 * @param {function} next
 */
var peerAction = function(id,action,next){
  var peer
  async.series(
    [
      //retrieve the peer
      function(next){
        Peer.findById(id,function(err,result){
          if(err) return next(err.message)
          if(!result) return next('Could not find peer')
          peer = result
          next()
        })
      },
      //check if the peer is at the right status
      function(next){
        if(!peer.status.match(new RegExp(action.status,'i')))
          return next('Peer not ready or already running, cannot ' + action.name)
        next()
      },
      //attempt to login to the peer with ssh
      function(next){
        var client = sshConnect(peer)
        client.on('ready',function(){
          sshBufferCommand(client,action.cmd,function(err){
            if(err) return next(err)
            next()
          })
        })
        client.on('error',function(err){
          next('Failed to connect to peer: ' + err)
        })
        client.doConnect()
      }
    ],
    function(err){
      //log this attempt
      async.series(
        [
          function(next){
            if(err){
              peer.log.push({message: err,level: 'warning'})
              if(action.finalStatusError) peer.status = action.finalStatusError
            }
            else{
              peer.log.push({message: 'Peer ' + action.name + ' successful',level: 'info'})
              if(action.finalStatusSuccess) peer.status = action.finalStatusSuccess
            }
            peer.save(function(err){
              if(err) return next(err.message)
              next()
            })
          }
        ],function(error){
          if(err) return next(err)
          if(error) return next(error)
          next()
        }
      )
    }
  )
}


/**
 * List peers
 * @param {object} req
 * @param {object} res
 */
exports.list = function(req,res){
  if('post' === req.method.toLowerCase() && req.body.remove && req.body.remove.length){
    if(req.body.upgrade){
      async.each(
        req.body.remove,
        function(id,next){
          peerUpgrade(id,res,next)
        },
        function(err){
          if(err) res.end('ERROR: ' + err)
          else res.end('COMPLETE')
        }
      )
    } else if (req.body.start){
      async.each(
        req.body.remove,
        function(id,next){
          peerAction(id,actionPeerStart,next)
        },
        function(err){
          if(err) req.flash('error',err)
          else req.flash('success','Peers started')
          res.redirect('/peer')
        }
      )
    } else if (req.body.stop){
      async.each(
        req.body.remove,
        function(id,next){
          peerAction(id,actionPeerStop,next)
        },
        function(err){
          if(err) req.flash('error',err)
          else req.flash('success','Peers stopped')
          res.redirect('/peer')
        }
      )
    } else if (req.body.restart){
      async.each(
        req.body.remove,
        function(id,next){
          peerAction(id,actionPeerRestart,next)
        },
        function(err){
          if(err) req.flash('error',err)
          else req.flash('success','Peers restarted')
          res.redirect('/peer')
        }
      )
    } else if (req.body.delete){
      list.remove(Peer,req.body.remove,function(err,count){
        if(err) req.flash('error','Removed ' + count + ' item(s) before removal failed ' + err)
        else{
          req.flash('success','Deleted ' + count + ' item(s)')
          res.redirect('/peer')
        }
      })
    } else {
      req.flash('warning','No action submitted')
      res.redirect('/peer')
    }
  } else {
    var limit = parseInt(req.query.limit,10) || 10
    var start = parseInt(req.query.start,10) || 0
    var search = req.query.search || ''
    if(start < 0) start = 0
    Peer.list({start: start, limit: limit, find: search},function(err,count,results){
      res.render('peer/list',{
        page: list.pagination(start,count,limit),
        count: count,
        search: search,
        limit: limit,
        list: results
      })
    })
  }
}


/**
 * Create peer
 * @param {object} req
 * @param {object} res
 */
exports.create = function(req,res){
  res.render('peer/create')
}


/**
 * Peer update form
 * @param {object} req
 * @param {object} res
 */
exports.edit = function(req,res){
  Peer.findById(req.query.id,function(err,result){
    if(err){
      req.flash('error',err)
      res.redirect('/peer')
    } else{
      if(!result) result = {}
      res.render('peer/edit',{
        peer: result,
        logCssClass: function(row){
          if('info' === row.level) return ''
          if('success' === row.level) return 'alert-success'
          if('warning' === row.level) return 'alert-warning'
          if('error' === row.level) return 'alert-error'
        }
      })
    }
  })
}


/**
 * Save peer
 * @param {object} req
 * @param {object} res
 */
exports.save = function(req,res){
  var id, doc
  async.series(
    [
      //try to find the peer
      function(next){
        Peer.findById(req.body.id,function(err,result){
          if(err) return next(err.message)
          if(!result) doc = new Peer()
          else doc = result
          next()
        })
      },
      //resolve ip if we have to
      function(next){
        if(req.body.ip) return next()
        dns.lookup(req.body.hostname,function(err,result){
          if(err) return next(err)
          if(!result) return next('Could not look up IP from hostname')
          req.body.ip = result
          next()
        })
      },
      //populate doc
      function(next){
        doc.hostname = req.body.hostname
        doc.ip = req.body.ip
        doc.sshPort = req.body.sshPort || 22
        doc.config = req.body.config || undefined
        next()
      },
      //log
      function(next){
        //come up with a snapshot for the log
        var snapshot = doc.toJSON()
        delete snapshot.log
        delete snapshot._id
        doc.log.push({message: 'Peer saved ' + JSON.stringify(snapshot), level: 'success'})
        next()
      },
      //save
      function(next){
        doc.save(function(err,result){
          if(err) return next(err.message)
          id = result.id
          next()
        })
      }
    ],
    function(err){
      if(err) req.flash('error',err)
      else req.flash('success','Peer saved')
      res.redirect(id ? '/peer/edit?id=' + id : '/peer')
    }
  )
}


/**
 * Test peer for readyness with executioner
 * @param {object} req
 * @param {object} res
 */
exports.test = function(req,res){
  var peer
  async.series(
    [
      //retrieve the peer
      function(next){
        Peer.findById(req.query.id,function(err,result){
          if(err) return next(err.message)
          if(!result) return next('Could not find peer')
          peer = result
          next()
        })
      },
      //attempt connect to the peer
      function(next){
        if(!peer.ip) return next('No IP defined for the peer')
        var client = net.connect(peer.sshPort || 22,peer.ip)
        client.on('connect',function(){
          client.end()
          next()
        })
        client.on('error',function(err){
          next('Failed to connect to peer SSH: ' + err.code)
        })
      },
      //attempt to login to the peer with ssh
      function(next){
        var client = sshConnect(peer)
        client.on('ready',function(){
          //find out some information about the peer
          client.exec('cat /etc/debian_version',function(err,stream){
            if(err) return next(err)
            var version = ''
            stream.setEncoding('utf-8')
            stream.on('data',function(data){
              version += data
            })
            stream.on('end',function(code){
              if(code > 0) return next('Could not determine if the peer is running debian')
              version = version.trim()
              if(!version) return next('Could not get the version of debian')
              var match = version.match(/^(\d+)\.(\d+)/)
              if(!match[1] || parseInt(match[1],10) < 7) return next('This version of debian is too old: ' + version)
              next()
            })
            stream.on('exit',function(code){
              if(code > 0) next('Could not get version')
            })
          })
        })
        client.on('error',function(err){
          next('Failed to connect to peer: ' + err)
        })
        client.doConnect()
      }
    ],
    function(err){
      //log this attempt
      async.series(
        [
          function(next){
            if(err){
              peer.log.push({message: err, level: 'error'})
              peer.status = 'error'
            } else {
              peer.log.push({message: 'Successfully communicated with peer and tested os validity', level: 'success'})
              //only set the status if its below what we can set
              if(peer.status.match(/error|unknown/i))
                peer.status = 'tested'
            }
            peer.save(function(err){
              if(err) return next(err.message)
              next()
            })
          }
        ],
        function(error){
          if(err) req.flash('error',error)
          if(err) req.flash('error',err)
          else req.flash('success','Peer communication test successful')
          res.redirect(peer.id ? '/peer/edit?id=' + peer.id : '/peer')
        }
      )
    }
  )
}


/**
 * Test communication with a peer
 * @param {object} req
 * @param {object} res
 */
exports.refresh = function(req,res){
  var peer
  async.series(
    [
      //retrieve the peer
      function(next){
        Peer.findById(req.query.id,function(err,result){
          if(err) return next(err.message)
          if(!result) return next('Could not find peer')
          peer = result
          next()
        })
      },
      //check if the peer is at the right status
      function(next){
        if(peer.status.match(/unknown|error/i))
          return next('Peer not ready to be refreshed, try testing first')
        next()
      },
      //attempt to login to the peer with ssh
      function(next){
        var client = sshConnect(peer)
        client.on('ready',function(){
          //collect some information about the peer
          async.parallel(
            [
              //get the os version
              function(next){
                var cmd = 'cat /etc/debian_version'
                sshBufferCommand(client,cmd,function(err,result){
                  if(err) return next(err)
                  result = result.trim()
                  if(!result) return next('Could not get the version of debian')
                  peer.os.name = 'Debian'
                  peer.os.version = result
                  next()
                })
              },
              //get the kernel version
              function(next){
                var cmd = 'uname -r'
                sshBufferCommand(client,cmd,function(err,result){
                  result = result.trim()
                  peer.os.kernel = result
                  next()
                })
              },
              //get the arch
              function(next){
                var cmd = 'uname -m'
                sshBufferCommand(client,cmd,function(err,result){
                  result = result.trim()
                  peer.os.arch = result
                  next()
                })
              },
              //get the oose version (if we can)
              function(next){
                var cmd = 'cat /opt/oose/config.js'
                sshBufferCommand(client,cmd,function(err,result){
                  var match = versionExp.exec(result)
                  if(!match || 2 !== match.length){
                    peer.version = 'unknown'
                    return next()
                  }
                  peer.version = match[1].trim()
                  next()
                })
              },
              //get the uptime
              function(next){
                var cmd = 'uptime'
                sshBufferCommand(client,cmd,function(err,result){
                  result = result.trim()
                  var match = uptimeExp.exec(result)
                  if(!match || 4 !== match.length) return next('Couldnt parse uptime')
                  peer.os.uptime = match[1]
                  var load = match[3].split(',')
                  load.forEach(function(v,i){
                    load[i] = v.trim()
                  })
                  peer.os.load = load
                  next()
                })
              }
            ],
            next
          )
        })
        client.on('error',function(err){
          next('Failed to connect to peer: ' + err)
        })
        client.doConnect()
      }
    ],
    function(err){
      //log this attempt
      async.series(
        [
          function(next){
            if(err){
              peer.log.push({message: err, level: 'warning'})
              peer.status = 'error'
            } else {
              peer.log.push({message: 'Successfully refreshed stats', level: 'info'})
              if(peer.status.match(/tested|error/i))
                peer.status = 'staging'
            }
            peer.save(function(err){
              if(err) return next(err.message)
              next()
            })
          }
        ],
        function(error){
          if(err) req.flash('error',error)
          if(err) req.flash('error',err)
          else req.flash('success','Peer refresh successful')
          res.redirect(peer.id ? '/peer/edit?id=' + peer.id : '/peer')
        }
      )
    }
  )
}


/**
 * Prepare peer for installation
 * @param {object} req
 * @param {object} res
 */
exports.prepare = function(req,res){
  var peer
  var banner = function(msg){
    res.write('\n---------------------\n')
    res.write(msg + '\n')
    res.write('---------------------\n')
  }
  async.series(
    [
      //retrieve the peer
      function(next){
        Peer.findById(req.query.id,function(err,result){
          if(err) return next(err.message)
          if(!result) return next('Could not find peer')
          peer = result
          next()
        })
      },
      //check if the peer is at the right status
      function(next){
        if(peer.status.match(/unknown/i))
          return next('Peer not ready to be prepared, it is either already prepared or needs refreshed first')
        next()
      },
      //attempt to login to the peer with ssh
      function(next){
        var client = sshConnect(peer)
        client.on('ready',function(){
          sshStreamScript(client,res,__dirname + '/../scripts/prepare.sh',next)
        })
        client.on('error',function(err){
          next('Failed to connect to peer: ' + err)
        })
        client.doConnect()
      }
    ],
    function(err){
      //log this attempt
      async.series(
        [
          function(next){
            if(err){
              peer.log.push({message: err, level: 'error'})
              peer.status = 'error'
            } else {
              peer.log.push({message: 'Successfully prepared peer for installation', level: 'success'})
              if(peer.status.match(/staging|error/i))
                peer.status = 'ready'
            }
            peer.save(function(err){
              if(err) return next(err.message)
              next()
            })
          }
        ],
        function(error){
          if(err) req.flash('error',error)
          if(err) req.flash('error',err)
          else req.flash('success','Peer prepared for installation')
          banner('Operation Complete, close this window and refresh')
          res.end()
        }
      )
    }
  )
}


/**
 * Install peer
 * @param {object} req
 * @param {object} res
 */
exports.install = function(req,res){
  var peer
  var banner = function(msg){
    res.write('\n---------------------\n')
    res.write(msg + '\n')
    res.write('---------------------\n')
  }
  async.series(
    [
      //retrieve the peer
      function(next){
        Peer.findById(req.query.id,function(err,result){
          if(err) return next(err.message)
          if(!result) return next('Could not find peer')
          peer = result
          next()
        })
      },
      //check if the peer is at the right status
      function(next){
        if(peer.status.match(/unknown|staging|tested/i))
          return next('Peer not ready to be installed, prepare it first')
        next()
      },
      //attempt to login to the peer with ssh
      function(next){
        var client = sshConnect(peer)
        client.on('ready',function(){
          sshStreamScript(client,res,__dirname + '/../scripts/install.sh',next)
        })
        client.on('error',function(err){
          next('Failed to connect to peer: ' + err)
        })
        client.doConnect()
      }
    ],
    function(err){
      //log this attempt
      async.series(
        [
          function(next){
            if(err){
              peer.log.push({message: err, level: 'error'})
              peer.status = 'error'
            } else {
              peer.log.push({message: 'Successfully installed peer', level: 'success'})
              if(peer.status.match(/ready|error/i))
                peer.status = 'stopped'
            }
            peer.save(function(err){
              if(err) return next(err.message)
              next()
            })
          }
        ],
        function(error){
          if(err) req.flash('error',error)
          if(err) req.flash('error',err)
          else req.flash('success','Peer installed')
          banner('Operation Complete, close this window and refresh')
          res.end()
        }
      )
    }
  )
}


/**
 * Upgrade peer
 * @param {object} req
 * @param {object} res
 */
exports.upgrade = function(req,res){
  var banner = function(msg){
    res.write('\n---------------------\n')
    res.write(msg + '\n')
    res.write('---------------------\n')
  }
  async.series(
    [
      function(next){
        peerUpgrade(req.query.id,res,next)
      }
    ],
    function(err){
      if(err) req.flash('error',err)
      else req.flash('success','Peer upgraded')
      banner('Operation Complete, close this window and refresh')
      res.end()
    }
  )
}


/**
 * Update config
 * @param {object} req
 * @param {object} res
 */
exports.updateConfig = function(req,res){
  var peer
  async.series(
    [
      //retrieve the peer
      function(next){
        Peer.findById(req.query.id,function(err,result){
          if(err) return next(err.message)
          if(!result) return next('Could not find peer')
          peer = result
          next()
        })
      },
      //check if the peer is at the right status
      function(next){
        if(!peer.status.match(/started|stopped|ok|error/i))
          return next('Peer not ready for config update, make sure it is installed')
        next()
      },
      //attempt to login to the peer with ssh
      function(next){
        var client = sshConnect(peer)
        client.on('ready',function(){
          client.sftp(function(err,sftp){
            if(err) return next(err)
            var stream = sftp.createWriteStream('/opt/oose/config.local.js')
            stream.on('finish',function(){
              next()
            })
            stream.write(peer.config)
            stream.end()
          })
        })
        client.on('error',function(err){
          next('Failed to connect to peer: ' + err)
        })
        client.doConnect()
      }
    ],
    function(err){
      //log this attempt
      async.series(
        [
          function(next){
            if(err){
              peer.log.push({message: err, level: 'warning'})
            } else {
              peer.log.push({message: 'Successfully updated config', level: 'info'})
            }
            peer.save(function(err){
              if(err) return next(err.message)
              next()
            })
          }
        ],
        function(error){
          if(err) req.flash('error',error)
          if(err) req.flash('error',err)
          else req.flash('success','Peer config updated')
          res.redirect(peer.id ? '/peer/edit?id=' + peer.id : '/peer')
        }
      )
    }
  )
}


/**
 * Start peer
 * @param {object} req
 * @param {object} res
 */
exports.start = function(req,res){
  async.series(
    [
      function(next){
        peerAction(req.query.id,actionPeerStart,next)
      }
    ],
    function(err){
      if(err) req.flash('error',err)
      else req.flash('success','Peer started')
      res.redirect(req.query.id ? '/peer/edit?id=' + req.query.id : '/peer')
    }
  )
}


/**
 * Stop peer
 * @param {object} req
 * @param {object} res
 */
exports.stop = function(req,res){
  async.series(
    [
      function(next){
        peerAction(req.query.id,actionPeerStop,next)
      }
    ],
    function(err){
      if(err) req.flash('error',err)
      else req.flash('success','Peer stopped')
      res.redirect(req.query.id ? '/peer/edit?id=' + req.query.id : '/peer')
    }
  )
}


/**
 * Restart peer
 * @param {object} req
 * @param {object} res
 */
exports.restart = function(req,res){
  async.series(
    [
      function(next){
        peerAction(req.query.id,actionPeerRestart,next)
      }
    ],
    function(err){
      if(err) req.flash('error',err)
      else req.flash('success','Peer restarted')
      res.redirect(req.query.id ? '/peer/edit?id=' + req.query.id : '/peer')
    }
  )
}
