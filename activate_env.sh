#!/bin/bash

# usage text visible when --help flag passed in
usage="$(basename "$0") -- Activate specific adexchange envioronment, setting all necessary environment variables.

where:
    -e      environment name (e.g. 'dev', 'production').  Default is 'production'
    --help  show this help text

example:
    # activates the 'dev' environment
    $ source $(basename "$0") -e dev
"

######### BEGIN environment parsing ########
# Default to production
env="production"

if [ ! -z $1 ]; then
  if [ $1 == '--help' ]; then
    echo "$usage"
    exit 0
  fi
fi

# fucking getopts
while getopts ":e:" opt; do
  case $opt in
    e)
      if [ "$OPTARG" != 'production' ] && [ "$OPTARG" != 'dev' ]; then
        echo "Invalid environment: $OPTARG.  Environment must be either 'dev' or 'production'"
        exit 1
      else
        env="$OPTARG"
      fi
      ;;
    \?)
      echo "Invalid option: -$OPTARG" >&2
      echo "$usage"
      exit 1
      ;;
    :)
      echo "Environment flag -$OPTARG requires an argument (either 'dev' or 'production')" >&2
      exit 1
      ;;
  esac
done

# now set NODE_ENV to env, setting NODE_ENV environment variable for subsequent scripts
export NODE_ENV="$env"

# make sure cliques-config repo is cloned & pull any new commits
if [ ! -d $HOME"/repositories/cliques-config" ]; then
    git clone git@github.com:cliquesads/cliques-config.git ../cliques-config
    ln -s ../cliques-config config
else
    cd ../cliques-config
    git pull
    cd ../adexchange
fi

# Now get proper environment variables for global package versions, etc.
source ./config/environments/adexchange_environment.cfg



############## BEGIN Environment Setup ##############


# Check if redis is installed, and set redis-cli alias if so
REDISPATH=$HOME'/redis-'$REDIS_VERSION
if [ ! -d $REDISPATH ]; then
    echo "ERROR: Redis $REDIS_VERSION install not found.  To fix this, run setup-redis.sh" >&2
    exit 1
else
    alias redis-cli=$HOME/redis-"$REDIS_VERSION"/src/redis-cli
fi

# Use this NVM
source .nvm/nvm.sh
if [ $? -eq 1 ]; then
    echo "ERROR: nvm not installed.  To fix this, run setup.sh" >&2
    exit 1
fi

#have to point to the right version of node, npm, pm2, mocha
nvm use $NODE_VERSION
if [ $? -eq 1 ]; then
    echo "ERROR: Node $NODE_VERSION not installed.  To fix this, run setup.sh" >&2
    exit 1
fi

# check if proper version of pm2 is installed in .nvm
pm2version=$(pm2 -V)
if [ $? -eq 127 ]; then
    echo "ERROR: pm2 not installed.  Please run setup.sh." >&2
    exit 1
fi

if [ $pm2version != $PM2_VERSION ]; then
    echo "ERROR: Environment requires pm2 version $PM2_VERSION, but version $pm2version currently installed. To fix this, run setup.sh" >&2
    exit 1
fi

exit 0