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

banner "Upgrading OOSE"
echo

if [ ! -d "/opt/oose" ]; then
  echo "OOSE not installed"
  exit 0
fi

# start running commands
runCommand "cd /opt/oose"
runCommand "git pull"
runCommand "git checkout stable"
runCommand "npm config set color false"
runCommand "npm -q --no-spin prune"
runCommand "npm -q --no-spin install"
#runCommand "npm -q --no-spin update"
if [ ! -d /opt/oose/log ]; then
  runCommand "mkdir /opt/oose/log"
fi
runCommand "chown -R node:node /opt/oose/log"
if [ ! -d /data ]; then
  runCommand "mkdir /data"
fi
runCommand "chown -R node:node /data"

banner "Upgrade Complete"
exit 0