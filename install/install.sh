#!/bin/bash

if [[ "force" != "$1" && -z /etc/debian_version ]]; then
  echo "Installer designed to run on Debian and this is not debian."
  echo "  To run this script anyway re-run with \"force\" as the only argument"
fi

