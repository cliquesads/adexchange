#!/usr/bin/env bash

# usage text visible when --help flag passed in
usage="$(basename "$0") -- Wrapper script for node-utils logsextractor, which moves log files to cloud storage and
deletes them

where:
    --help  show this help text
    -p path/to/pm2/logfiles
    -w path/to/winston/logfiles"

# BEGIN arg parsing

if [ ! -z $1 ]; then
  if [ $1 == '--help' ]; then
    echo "$usage"
    exit 0
  fi
fi

pm2=''
winston=''

# fucking getopts
while getopts ":p:" opt; do
  case $opt in
    e)
      pm2="$OPTARG"
      ;;
  esac
done

while getopts ":w:" opt; do
  case $opt in
    w)
      winston="$OPTARG"
      ;;
  esac
done

source activate_env.sh -e production

if [ $? -ne 0 ]; then
    exit $?
fi

echo "$pm2"
echo "$winston"

node node_modules/@cliques/cliques-node-utils/logsextractor.js -p "$pm2" -w "$winston"

exit 0
