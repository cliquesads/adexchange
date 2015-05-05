#!/bin/bash
# put any environment variables here

# not really sure if this is needed anymore but leaving it in anyway
source .nvm/nvm.sh

export NODE_ENV=production

#have to point to the right version of node, npm, pm2, mocha
nvm use 0.12.0