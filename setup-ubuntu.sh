#!/bin/bash

#system deps
#sudo apt-get install python-software-properties
#sudo apt-add-repository ppa:chris-lea/node.js #OLD
sudo apt-get update
sudo apt-get install gcc make build-essential

#download NVM and install NVM & node
curl https://raw.githubusercontent.com/creationix/nvm/v0.24.0/install.sh | NVM_DIR=$HOME/repositories/adexchange/.nvm bash
source .nvm/nvm.sh
nvm install 0.12.0

#install node dependencies
npm update
npm install
#have to install pm2 & mocha globally
npm install pm2 -g
npm install mocha -g

#clone config repo and make symlink
if [ ! -d $HOME"/repositories/cliques-config" ]; then
    git clone git@github.com:cliquesads/cliques-config.git ../cliques-config
    ln -s ../cliques-config config
fi