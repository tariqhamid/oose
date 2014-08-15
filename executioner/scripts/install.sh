#!/bin/bash

function banner {
  echo
  echo "----------------------"
  echo "$1"
  echo "----------------------"
}

function runCommand {
  banner "$1"
  $1
}

banner "Installing OOSE"
echo

if [ -d "/opt/oose" ]; then
  echo "OOSE already installed"
  exit 0
fi

# start running commands
runCommand "cd /opt"
runCommand "git clone -q git@github.com:eSited/oose.git"
runCommand "cd /opt/oose"
runCommand "git checkout stable"
runCommand "npm config set color false"
runCommand "npm -q --no-spin install"
runCommand "mkdir /opt/oose/log"
runCommand "chown -R node:node /opt/oose/log"
runCommand "mkdir /data"
runCommand "chown -R node:node /data"

banner "Installation Complete"
exit 0