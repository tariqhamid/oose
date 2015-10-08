#!/bin/bash

echo "Welcome to OOSE Store Installation"

oosedir="$1"

if [[ '' == "$1" ]]; then
  oosedir="/opt/oose"
fi

echo "Installing dependencies"
cd $oosedir
npm install

echo "Installing sysctl settings"
cp /etc/sysctl.conf /etc/sysctl.conf.orig
cp $oosedir/nginx/store_sysctl.conf /etc/sysctl.conf
sysctl -p

echo -n "Enabling user limits in pam common-session... "
if [[ '' == $(cat /etc/pam.d/common-session | grep pam_limits.so) ]]; then
  echo "session required        pam_limits.so" >> /etc/pam.d/common-session
fi
if [ -e /etc/security/limits.d/oose ]; then
  mv /etc/security/limits.d/oose /etc/security/oose.limits.old
fi
echo "* soft nofile 1310720" > /etc/security/limits.d/oose
echo "* hard nofile 2621440" >> /etc/security/limits.d/oose
echo "root soft nofile 1310720" >> /etc/security/limits.d/oose
echo "root hard nofile 2621440" >> /etc/security/limits.d/oose
echo "nginx soft nofile 1310720" >> /etc/security/limits.d/oose
echo "nginx hard nofile 2621440" >> /etc/security/limits.d/oose
echo "node hard nofile 2621440" >> /etc/security/limits.d/oose
echo "done"

echo -n "Upgrading terminal title... "
if [[ '' == $(cat /root/.bashrc | grep "^PS1=") ]]; then
  echo "PS1='\[\e]2;\u@\H:\w\a\]\$LOGNAME@\$HOSTNAME:\$PWD# '" >> /root/.bashrc
fi
echo "done"

#TODO I think this script needs to do a few more things

echo "Install Complete"
