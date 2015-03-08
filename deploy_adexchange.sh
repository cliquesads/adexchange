#!/bin/bash

source ./activate_production.sh
npm install

processname='adexchange'

running=$(pm2 list -m | grep "$processname")

if [ -z "$running" ]; then
    # hook PM2 up to web monitoring with KeyMetrics
    pm2 interact k79qp6h0w795o48 l6aqtb33eaiqyry
    # start in cluster mode
    pm2 start index.js --name "$processname" -i 0
else
    pm2 gracefulReload "$processname"
fi