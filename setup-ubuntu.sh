#!/bin/bash

#system deps
#sudo apt-get install python-software-properties
#sudo apt-add-repository ppa:chris-lea/node.js #OLD
sudo apt-get update
sudo apt-get install gcc make build-essential
source ~/.nvm/nvm.sh
nvm install 0.12.0

#install node dependencies
npm update
npm install
#have to install pm2 & mocha globally
sudo npm install pm2 -g --unsafe-perm
sudo npm install mocha -g

#clone config repo and make symlink
git clone git@github.com:cliquesads/cliques-config.git ../cliques-config
ln -s ../cliques-config config