#!/bin/bash

debMultiMediaAptList="/etc/apt/sources.list.d/deb-multimedia.list"

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

function userExists {
  if id -u $1 >/dev/null 2>&1; then
    echo 1
  else
    echo 0
  fi
}

banner "Preparing Peer for OOSE installation"
echo

# start running commands
runCommand "apt-get -q -y update"
runCommand "apt-get -q -y upgrade"
runCommand "apt-get -q -y install gcc g++ make git redis-server dstat vim screen snmpd mongodb nodejs nodejs-legacy wget curl ntp"

if [ $(userExists node) -eq 0 ]; then
  runCommand "useradd node"
fi

# run some sanity commands
mkdir /var/log/node > /dev/null 2>&1
touch /var/log/node/oose-err /var/log/node/oose-out > /dev/null 2>&1
chown -R node:node /var/log/node  > /dev/null 2>&1

# install npm
if [[ "$(which npm)" == "" ]]; then
  banner "Installing NPM"
  curl -s -L "https://npmjs.org/install.sh" > /tmp/npminstall.sh
  /bin/bash /tmp/npminstall.sh 2> /dev/null
  rcode="$?"
  rm -f /tmp/npminstall.sh
  if [ "$rcode" -gt 0 ]; then
    echo "Failed to install NPM"
    exit $rcode
  fi
  banner "Installing PM2"
  runCommand "npm config set color false"
  runCommand "npm -q --no-spin -g install pm2"
fi

# install ffmpeg?
if [[ "$(which ffmpeg)" == "" ]]; then
  banner "Installing FFMPEG"

  banner "Adding Deb Multimedia"
  echo "deb http://www.deb-multimedia.org wheezy main non-free" > /etc/apt/sources.list.d/deb-multimedia.list
  apt-get -q -y update
  apt-get -q -y --force-yes install deb-multimedia-keyring
  apt-get -q -y update

  runCommand "apt-get -q -y install ffmpeg gpac flvmeta flvtool2"
fi

# upgrade the snmp conf
if [[ "$(grep .1.3.6.1.2.1.31 /etc/snmp/snmpd.conf)" == "" ]]; then
  banner "Configuring SNMP"
  sed -i "/view   systemonly  included   .1.3.6.1.2.1.25.1/d" /etc/snmp/snmpd.conf
  # bad tabbing is intentional for the config file to look right
  sed -i "/view   systemonly  included   .1.3.6.1.2.1.1/a \
view   systemonly  included   .1.3.6.1.2.1.2\n\
view   systemonly  included   .1.3.6.1.2.1.4\n\
view   systemonly  included   .1.3.6.1.2.1.25\n\
view   systemonly  included   .1.3.6.1.2.1.31\n" /etc/snmp/snmpd.conf
  /etc/init.d/snmpd restart
fi

banner "Preparation Complete"
exit 0