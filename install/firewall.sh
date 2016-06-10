#!/bin/bash

echo "Welcome to OOSE Firewall installation tool"

pubeth="$1"
mgmtip="$2"

if [[ '' == "$pubeth" ]]; then
  echo "No interface provided"
  exit
fi

if [[ '' == "$mgmtip" ]]; then
  echo "No management IP provided"
  exit
fi

echo "Your interface is $pubeth"
echo "Your management IP is $mgmtip"

echo "Installing software"
apt-get -y install iptables iptables-persistent

echo -n "Flushing existing Tables... "
iptables -F
iptables -t nat -F
echo "done"

echo -n "Make sure table is accepting during work... "
iptables -P INPUT ACCEPT
iptables -P FORWARD ACCEPT
iptables -P OUTPUT ACCEPT
echo "done"

echo -n "Allow Outbound DNS... "
iptables -A OUTPUT -p udp -o "$pubeth" --dport 53 -j ACCEPT
iptables -A INPUT -p udp -i "$pubeth" --sport 53 -j ACCEPT
echo "done"

echo -n "Allow Loopback... "
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT
echo "done"

echo -n "Allow Inbound Ping... "
iptables -A INPUT -p icmp --icmp-type echo-request -j ACCEPT
iptables -A OUTPUT -p icmp --icmp-type echo-reply -j ACCEPT
echo "done"

echo -n "Allow Outbound Ping... "
iptables -A OUTPUT -p icmp --icmp-type echo-request -j ACCEPT
iptables -A INPUT -p icmp --icmp-type echo-reply -j ACCEPT
echo "done"

echo -n "Allow Inbound SSH on $mgmtip... "
iptables -A INPUT -i "$pubeth" -p tcp -d "$mgmtip" --dport 22 -m state --state NEW,ESTABLISHED -j ACCEPT
iptables -A OUTPUT -o "$pubeth" -p tcp -s "$mgmtip" --sport 22 -m state --state ESTABLISHED -j ACCEPT
echo "done"

echo -n "Allow Inbound HTTP, HTTPS... "
iptables -A INPUT -i "$pubeth" -p tcp -m multiport --dports 80,443 -m state --state NEW,ESTABLISHED -j ACCEPT
iptables -A OUTPUT -o "$pubeth" -p tcp -m multiport --sports 80,443 -m state --state ESTABLISHED -j ACCEPT
echo "done"

echo -n "Allow Outbound SSH, HTTP, HTTPS... "
iptables -A OUTPUT -o "$pubeth"  -p tcp -m multiport --dports 22,80,443 -m state --state NEW,ESTABLISHED -j ACCEPT
iptables -A INPUT -i "$pubeth" -p tcp -m multiport --sports 22,80,443 -m state --state ESTABLISHED -j ACCEPT
echo "done"

echo -n "Allow Inbound OOSE... "
iptables -A INPUT -i "$pubeth" -p tcp -m multiport --dports 5970,5971,5972 -m state --state NEW,ESTABLISHED -j ACCEPT
iptables -A OUTPUT -o "$pubeth"  -p tcp -m multiport --sports 5970,5971,5972 -m state --state ESTABLISHED -j ACCEPT
echo "done"

echo -n "Allow Outbound OOSE... "
iptables -A OUTPUT -o "$pubeth" -p tcp -m multiport --dports 5970,5971,5972 -m state --state NEW,ESTABLISHED -j ACCEPT
iptables -A INPUT -i "$pubeth" -p tcp -m multiport --sports 5970,5971,5972 -m state --state ESTABLISHED -j ACCEPT
echo "done"

echo -n "Allow Inbound CouchDB... "
iptables -A INPUT -i "$pubeth" -p tcp --dport 5984 -m state --state NEW,ESTABLISHED -j ACCEPT
iptables -A OUTPUT -o "$pubeth"  -p tcp --sport 5984 -m state --state ESTABLISHED -j ACCEPT
echo "done"

echo -n "Allow Outbound CouchDB... "
iptables -A OUTPUT -o "$pubeth" -p tcp --dport 5984 -m state --state NEW,ESTABLISHED -j ACCEPT
iptables -A INPUT -i "$pubeth" -p tcp --sport 5984 -m state --state ESTABLISHED -j ACCEPT
echo "done"

echo -n "Allow Inbound Redis... "
iptables -A INPUT -i "$pubeth" -p tcp --dport 6379 -m state --state NEW,ESTABLISHED -j ACCEPT
iptables -A OUTPUT -o "$pubeth"  -p tcp --sport 6379 -m state --state ESTABLISHED -j ACCEPT
echo "done"

echo -n "Allow Outbound Redis... "
iptables -A OUTPUT -o "$pubeth" -p tcp --dport 6379 -m state --state NEW,ESTABLISHED -j ACCEPT
iptables -A INPUT -i "$pubeth" -p tcp --sport 6379 -m state --state ESTABLISHED -j ACCEPT
echo "done"

echo -n "Allow Inbound Zabbix... "
iptables -A INPUT -i "$pubeth" -p tcp --dport 10050 -m state --state NEW,ESTABLISHED -j ACCEPT
iptables -A OUTPUT -o "$pubeth" -p tcp --sport 10050 -m state --state ESTABLISHED -j ACCEPT
echo "done"

echo -n "Allow Outbound Zabbix... "
iptables -A OUTPUT -o "$pubeth" -p tcp --dport 10050 -m state --state NEW,ESTABLISHED -j ACCEPT
iptables -A INPUT -i "$pubeth" -p tcp --sport 10050 -m state --state ESTABLISHED -j ACCEPT
echo "done"

echo
echo "Finished applying rules... printing table now"
iptables -nL --line-numbers -v

echo "We are now going to apply the firewall, please review the above is correct, or CONNECTION MAY BE LOST"
read -p "Are you sure (y|n)? " -n 1 -r
if [[ $REPLY =~ ^[Yy]$ ]]; then
  iptables -P INPUT DROP
  iptables -P FORWARD DROP
  iptables -P OUTPUT DROP
else
  echo "Aborting application"
  echo " To apply manually"
  echo "   iptables -P INPUT DROP"
  echo "   iptables -P FORWARD DROP"
  echo "   iptables -P OUTPUT DROP"
  exit
fi

echo "OOSE firewall installation complete"
exit
