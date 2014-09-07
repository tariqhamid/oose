#!/bin/bash

function banner {
  line=$(echo $1 | tr [:print:] [-*])
  echo
  echo ${line}
  echo "$1"
  echo ${line}
}

function runCommand {
  banner "$1"
  $1
}

banner "Installing OOSE"
echo

[ -d "/opt/oose" ] && echo "OOSE already installed" && exit 0

# start running commands
runCommand "cd /opt"
runCommand "git clone -q git@github.com:eSited/oose.git"
runCommand "cd /opt/oose"
runCommand "git checkout master"
npm config set color false
runCommand "npm -q --no-spin install"
runCommand "mkdir -p /var/log/node/oose"
runCommand "chown -R node:node /var/log/node"
runCommand "chown -R node:node /opt/oose/dt"
runCommand "rm -f /etc/service/oose"
runCommand "ln -sf /opt/oose/dt /etc/service/oose"
[ ! -d /opt/oose/log ] && runCommand "mkdir /opt/oose/log"
runCommand "chown -R node:node /opt/oose/log"
[ ! -d /data ] && runCommand "mkdir /data"
runCommand "chown -R node:node /data"

banner "Installation Complete"
exit 0
