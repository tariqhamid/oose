#!/bin/bash
debMultiMediaAptList="/etc/apt/sources.list.d/deb-multimedia.list"
hostname=$(hostname)
hostnameDomain=$(hostname -d)
hostnameFQDN=$(hostname -f)

nginxConfig=$(cat <<NGX_CONFIG
user node;
worker_processes 17;
pid /run/nginx.pid;

events {
  worker_connections 32768;
  multi_accept off;
}

http {
  sendfile on;
  tcp_nopush on;
  tcp_nodelay on;
  keepalive_timeout 5;
  types_hash_max_size 2048;
  client_max_body_size 0;
  # server_tokens off;

  server_names_hash_bucket_size 64;
  server_name_in_redirect off;

  include /etc/nginx/mime.types;
  default_type application/octet-stream;

  ##
  # Logging Settings
  ##
  access_log off;
  error_log /var/log/nginx/error.log;

  ##
  # Gzip Settings
  ##

  gzip on;
  gzip_disable "msie6";

  # setup cache
  proxy_cache_path                /dev/shm/cache levels=1:2 keys_zone=web-cache:512m max_size=7000m inactive=1000m;
  proxy_temp_path                 /dev/shm/cache/tmp;
  proxy_cache_valid               404 1m;
  proxy_redirect                  off;
  proxy_set_header                X-Forwarded-For  \$proxy_add_x_forwarded_for;
  proxy_pass_header               User-Agent;
  proxy_max_temp_file_size        0;
  proxy_buffer_size               4k;
  proxy_buffers                   16 32k;
  proxy_busy_buffers_size         128k;
  proxy_temp_file_write_size      128k;
  proxy_connect_timeout           300;
  proxy_send_timeout              300;
  proxy_read_timeout              300;

  ##
  # Virtual Host Configs
  ##
  include /etc/nginx/conf.d/*.conf;
  include /etc/nginx/sites-enabled/*;
}
NGX_CONFIG
)

nginxConfigExports=$(cat <<NGX_CONFIG
# ${hostname} http
server {
  listen 80;
  server_name ${hostnameFQDN};

  proxy_next_upstream error timeout invalid_header http_500 http_502 http_503 http_504;
  proxy_redirect off;
  proxy_buffering off;
  proxy_set_header Host  \$host;
  proxy_set_header X-Real-IP \$remote_addr;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;

  location /nginx_status {
    stub_status on;
    access_log   off;
  }

  location / {
    proxy_pass http://127.0.0.1:3001;
  }
}

# ${hostname} https
server {
  listen 443 ssl;
  server_name ${hostnameFQDN};
  ssl_certificate ssl/ssl.crt;
  ssl_certificate_key ssl/ssl.key;

  proxy_next_upstream error timeout invalid_header http_500 http_502 http_503 http_504;
  proxy_redirect off;
  proxy_buffering off;
  proxy_set_header Host  \$host;
  proxy_set_header X-Real-IP \$remote_addr;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;

  location /nginx_status {
    stub_status on;
    access_log   off;
  }

  location / {
    proxy_pass http://127.0.0.1:3001;
  }
}
NGX_CONFIG
)

nginxConfigPrism=$(cat <<NGX_CONFIG
# prism http
server {
  listen 80;
  server_name prism.${hostnameDomain} ${hostnameDomain};

  proxy_next_upstream error timeout invalid_header http_500 http_502 http_503 http_504;
  proxy_redirect off;
  proxy_buffering off;
  proxy_set_header Host  \$host;
  proxy_set_header X-Real-IP \$remote_addr;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;

  location /nginx_status {
    stub_status on;
    access_log   off;
  }

  location / {
    proxy_pass http://127.0.0.1:3003;
  }
}

# prism https
server {
  listen 443 ssl;
  server_name prism.${hostnameDomain} ${hostnameDomain};
  ssl_certificate ssl/ssl.crt;
  ssl_certificate_key ssl/ssl.key;

  proxy_next_upstream error timeout invalid_header http_500 http_502 http_503 http_504;
  proxy_redirect off;
  proxy_buffering off;
  proxy_set_header Host  \$host;
  proxy_set_header X-Real-IP \$remote_addr;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;

  location /nginx_status {
    stub_status on;
    access_log   off;
  }

  location / {
    proxy_pass http://127.0.0.1:3003;
  }
}
NGX_CONFIG
)

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
runCommand "apt-get -q -y install gcc g++ make git redis-server dstat vim screen snmpd mongodb nodejs nodejs-legacy wget curl ntp nginx"

if [ $(userExists node) -eq 0 ]; then
  banner "Creating user node"
  runCommand "adduser --disabled-password --shell=/bin/bash node"
fi

banner "Ensuring user file open limits"
limitsSet=0
# setup pam session common if we have to
if [[ $(grep "pam_limits.so" /etc/pam.d/common-session) == "" ]]; then
  limitSet=1
  sed -i "/# end of pam-auth-update config/a \
session required pam_limits.so\n" /etc/pam.d/common-session
fi

# setup security limits if not already
limitfile="/etc/security/limits.d/node.conf"
if [[ $(grep -e "node\s+soft" $limitfile) == "" ]]; then
  limitSet=2
  echo "root            soft    nofile          262144\n\
root            hard    nofile          524288\n\
node            soft    nofile          262144\n\
node            hard    nofile          524288\n\
" > $limitfile
fi

# run some sanity commands
mkdir -p /var/log/node/oose > /dev/null 2>&1
chown -R node:node /var/log/node  > /dev/null 2>&1

# setup nginx
if [ ! -f "/etc/nginx/sites-available/export.${hostnameDomain}" ]; then
  banner "Configuring Nginx"
  export="sites-available/export.${hostnameDomain}"
  prism="sites-available/prism.${hostnameDomain}"
  echo "$nginxConfig" > /etc/nginx/nginx.conf
  echo "$nginxConfigExports" > /etc/nginx/${export}
  echo "$nginxConfigPrism" > /etc/nginx/${prism}
  rm -rf /etc/nginx/sites-enabled/*
  cd /etc/nginx/sites-enabled
  ln -s ../${export}
  ln -s ../${prism}
  nginx -t
  if [ $? -gt 0 ]; then
    echo "Nginx configuration test failed"
    exit 1
  fi
fi
runCommand "/etc/init.d/nginx restart"

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

  banner "Fuck PM2!!!!!!"
  runCommand "pm2 -s --no-color flush"
  runCommand "pm2 -s --no-color kill"
  npm config set color false
  runCommand "npm -q --no-spin -g uninstall pm2"

  banner "Installing daemontools"
  runCommand "apt-get -q -y install daemontools-run"
  runCommand "init q"
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
  #kill stupid logging and enable service
  sed -i -e"s/^\(SNMPDOPTS='\)-Lsd /\1/" \
   -e"s/^\(TRAPDOPTS='\)-Lsd/\1-Lf\ \/dev\/null/" \
   -e"s/^\(SNMPDRUN=\).*$/\1yes/" /etc/default/snmpd
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
