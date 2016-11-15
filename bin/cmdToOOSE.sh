#!/bin/bash

cmd="$1"

while read svr; do
  echo "Executing $cmd on $svr ..."
  echo "----------------------------------------"
  ssh -4 $svr "$cmd" < /dev/null
  echo
done < oose_server_list
