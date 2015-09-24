#!/bin/bash

if [[ 'help' == "$1" || '-h' == "$1" || '--help' == "$1" ]]; then
  echo "OOSE Debian Preparation Tool"
  echo
  echo "./prepareDebian.sh"
  echo "eg: ./prepareDebian.sh"
  echo
  exit
fi

redisconfig="/etc/redis/redis.conf"

echo -n "Enabling nginx repository... "
mkdir -p $aptlistdir
echo "#nginx" >> $aptlistdir/nginx.list
echo "deb http://nginx.org/packages/debian/ wheezy nginx" >> $aptlistdir/nginx.list
echo "deb-src http://nginx.org/packages/debian/ wheezy nginx" >> $aptlistdir/nginx.list
wget -O /tmp/nginx_repo.key "http://nginx.org/packages/keys/nginx_signing.key"
cat /tmp/nginx_repo.key | apt-key add -
rm /tmp/nginx_repo.key
echo "done"

echo "Updating software"
apt-get update
apt-get -y upgrade

echo "Installing Tools"
apt-get -y install dstat vim gdisk mtr traceroute git make gcc g++

echo "Installing NGINX"
apt-get -y install nginx
/etc/init.d/nginx start
insserv nginx

echo "Installing Redis"
apt-get -y install redis-server
insserv redis-server
sed -i "s/#maxmemory/maxmemory 67108864/" $redisconfig
/etc/init.d/redis-server restart

echo "Installing Node.js"
apt-get -y install curl
curl -sL https://deb.nodesource.com/setup_0.10 | bash -
apt-get update
apt-get -y install nodejs
node -v

echo "Installing Daemontools"
apt-get -y install daemontools daemontools-run
ln -s /etc/service /service

echo "Installing Node NDT"
npm -g install ndt

echo "Installing sysfsutils"
apt-get -y isntall sysfsutils
insserv sysfsutils
/etc/init.d/sysfsutils start

echo -n "Adding Node User... "
useradd node
echo "done"

echo "Preparation Complete"
