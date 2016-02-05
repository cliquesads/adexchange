#!/bin/sh

# usage text visible when --help flag passed in
usage="$(basename "$0") -- Sets up proper version of Redis for this environment and starts redis-server

where:
    --help  show this help text"

if [ ! -z $1 ]; then
  if [ $1 == '--help' ]; then
    echo "$usage"
    exit 0
  fi
fi

if [ -z "$REDIS_VERSION" ]; then
    echo "ERROR: REDIS_VERSION environment variable not set. Please make sure you've 'source'd the right environment .cfg" >&2
    exit 1
fi

#install redis from source to ensure latest version
REDISPATH=$HOME'/redis-'$REDIS_VERSION

if [ ! -d $REDISPATH ]; then
    cd $HOME
    wget 'http://download.redis.io/releases/redis-'$REDIS_VERSION'.tar.gz'
    tar xzf 'redis-'$REDIS_VERSION'.tar.gz'
    cd 'redis-'$REDIS_VERSION
    make
    rm $HOME'/redis-'$REDIS_VERSION'.tar.gz'
fi

cd $REDISPATH'/src'

# Now start redis-server
./redis-server $HOME/repositories/cliques-config/redis/redis.conf

exit 0