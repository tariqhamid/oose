#!/bin/bash

function banner {
  line="${1//./-}"
  echo
  echo $line
  echo "$1"
  echo $line
}

function runCommand {
  banner "$1"
  $1
}

banner "Installing OOSE"
echo

[ -d "/opt/oose" ] && echo "OOSE already installed" && exit 0

# start running commands
runCommand "cd /opt && git clone -q git@github.com:eSited/oose.git"
runCommand "cd /opt/oose && git checkout stable"
npm config set color false
runCommand "npm -q --no-spin install"
runCommand "chown -R node:node /opt/oose/dt"
runCommand "ln -sf /etc/service/oose /opt/oose/dt"
[ ! -d /opt/oose/log ] && runCommand "mkdir /opt/oose/log"
runCommand "chown -R node:node /opt/oose/log"
[ ! -d /data ] && runCommand "mkdir /data"
runCommand "chown -R node:node /data"

banner "Installation Complete"
exit 0
