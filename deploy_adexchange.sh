#!/bin/bash

source ./activate_production.sh
npm install

if [ ! -d $HOME"/repositories/cliques-config" ]; then
    git clone git@github.com:cliquesads/cliques-config.git ../cliques-config
    ln -s ../cliques-config config
else
    cd ../cliques-config
    git pull
    cd ../adexchange
fi

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