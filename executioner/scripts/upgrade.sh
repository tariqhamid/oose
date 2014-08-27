#!/bin/bash

function banner {
  line=$(echo $1 | tr [:print:] [-*])
  echo
  echo $line
  echo "$1"
  echo $line
}

function runCommand {
  banner "$1"
  $1
}

banner "Upgrading OOSE"
echo

[ ! -d "/opt/oose" ] && echo "OOSE not installed" && exit 0

# start running commands
runCommand "cd /opt/oose && git checkout stable && git pull"
npm config set color false
runCommand "npm -q --no-spin install"
runCommand "npm -q --no-spin prune"
runCommand "npm -q --no-spin update"
runCommand "chown -R node:node /opt/oose/dt"
runCommand "ln -sf /etc/service/oose /opt/oose/dt"
[ ! -d /opt/oose/log ] && runCommand "mkdir /opt/oose/log"
runCommand "chown -R node:node /opt/oose/log"
[ ! -d /data ] && runCommand "mkdir /data"
runCommand "chown -R node:node /data"

banner "Upgrade Complete"
exit 0
