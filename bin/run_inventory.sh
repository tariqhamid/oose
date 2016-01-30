#!/bin/bash

cd /opt/oose2;
find /media/**/config.*.js -type f | while read line; do
  export OOSE_CONFIG=$line
  export DEBUG=infant*
  echo "Starting inventory $line"
  node store/inventory.js
  echo "Inventory complete for $line"
done

echo "Inventory Complete"

#xargs -I{} OOSE_CONFIG={} node prism/inventory.js

