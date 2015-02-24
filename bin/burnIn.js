'use strict';
var P = require('bluebird')
var cp = require('child_process')
var program = require('commander')
var oose = require('oose-sdk')
var ProgressBar = require('progress')

var UserError = oose.UserError

var config = require('../config')

var disks = []
var progress = {}

var parseDisk = function(val){
  disks = val.split(',')
}

program
  .version(config.version)
  .option('-c, --cpu','Enable CPU testing')
  .option('-C, --cpu-cores <n>','Number of CPU cores')
  .option('-d, --disk <items>','Disks to test',parseDisk)
  .option('-m, --memory','Enable memory testing')
  .option('-M, --memory-amount <n>','MB of memory to test')
  .option('-n, --network','Enable network testing')
  .option('-i, --iperf <s>','iperf server for network testing')
  .option('-r, --rounds <n>','Repeat test n times')
  .parse(process.argv)

//make some promises
P.promisifyAll(cp)

P.try(function(){
  console.log('Welcome to OOSE Burn In')
  console.log('-----------------------')
  if(disks.length > 0)
    console.log('Disk testing enabled...')
  if(program.cpu)
    console.log('CPU testing enabled...')
  if(program.memory)
    console.log('Memory testing enabled...')
  if(program.network)
    console.log('Network testing enabled...')
  if(program.network && !program.iperf)
    throw new UserError('Network testing enabled without iperf server')
  var rounds = +(program.rounds || 1)
  console.log('About to start ' + rounds + ' rounds of concurrent testing')
  console.log('WARNING! System will become very unresponsive during tests.')
  progress = new ProgressBar(
    '  burn-in [:bar] :current/:total :percent :etas',
    {
      total: rounds,
      width: 50,
      complete: '=',
      incomplete: '-'
    }
  )
  var iterations = []
  for(var i = 0; i < rounds; i++){
    iterations.push(i)
  }
  return iterations
})
  .each(function(){
    var cpuCores = +(program.cpuCores || 1)
    var promises = []
    var i = 0
    //test disks
    if(disks.length > 0){
      var disk = ''
      for(i = 0; i < disks.length; i++){
        disk = disks[i]
        promises.push(cp.execAsync('cd ' + disk + '; iozone -a'))
      }
    }
    //test cpu
    if(program.cpu){
      for(i = 0; i < cpuCores; i++){
        promises.push(cp.execAsync('nbench'))
      }
    }
    //test memory
    if(program.memory){
      var memoryAmount = program.memoryAmount || 1024
      promises.push(cp.execAsync('memtester ' + memoryAmount + 'M 1'))
    }
    //test network
    if(program.network && program.iperf){
      promises.push(
        cp.execAsync('iperf3 -t 300 -c ' + program.iperf)
          .then(function(){
            return cp.execAsync('iperf3 -R -t 300 -c ' + program.iperf)
          })
      )
    }
    return P.all(promises)
      .finally(function(){
        progress.tick()
      })
  })
  .then(function(){
    console.log('Burn in tests complete. Looks good :)  Bye!')
    process.exit()
  })
