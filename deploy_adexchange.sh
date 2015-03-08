#!/bin/bash

source ./activate_production.sh
npm install
pm2 gracefulReload adexchange