#!/bin/bash

echo "Welcome to OOSE Zabbix Agent Installation"

wget -O /tmp/zabbix-release.deb "http://repo.zabbix.com/zabbix/2.4/debian/pool/main/z/zabbix-release/zabbix-release_2.4-1+wheezy_all.deb"
dpkg -i /tmp/zabbix-release.deb
apt-get update
apt-get -y install zabbix-agent
insserv zabbix-agent
/etc/init.d/zabbix-agent restart

echo "Installation complete"
echo "  Dont forget to update the configuration"
echo "    /etc/zabbix/zabbix_agentd.d/<monitor name>.conf"
echo
