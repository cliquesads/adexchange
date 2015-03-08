#!/bin/bash
# put any environment variables here

# not really sure if this is needed anymore but leaving it in anyway
source .nvm/nvm.sh

export NODE_ENV=production

#have to point to the right version of node, npm, pm2, mocha
node_version='0.12.0'
node_path='.nvm/versions/node/v'$node_version'/bin/'
export node=$node_path'node'
export npm=$node_path'npm'
export pm2=$node_path'pm2'
export mocha=$node_path'mocha'