#!/bin/bash

#system deps
sudo apt-get install python-software-properties
sudo apt-add-repository ppa:chris-lea/node.js
sudo apt-get update
sudo apt-get install gcc make build-essential
sudo install nodejs

#install node dependencies
npm install
#have to install pm2 globally
sudo npm install pm2 -g --unsafe-perm

#clone config repo and make symlink
git clone git@github.com:cliquesads/cliques-config.git ../cliques-config
ln -s ../cliques-config config