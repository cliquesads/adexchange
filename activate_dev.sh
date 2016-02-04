#!/bin/bash
# put any environment variables here

# not really sure if this is needed anymore but leaving it in anyway
source .nvm/nvm.sh

export NODE_ENV=dev
alias redis-cli=$HOME/redis-3.0.1/src/redis-cli

#have to point to the right version of node, npm, pm2, mocha
nvm use 0.12.0
#nvm use 5.0
#npm install pm2@1.0.0 -g
#pm2 update