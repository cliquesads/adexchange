#!/bin/sh

#install redis from source to ensure latest version
REDISVERSION='3.0.1'
REDISPATH=$HOME'/redis-'$REDISVERSION

if [ ! -d $REDISPATH ]; then
    cd $HOME
    wget 'http://download.redis.io/releases/redis-'$REDISVERSION'.tar.gz'
    tar xzf 'redis-'$REDISVERSION'.tar.gz'
    cd 'redis-'$REDISVERSION
    make
    rm $HOME'/redis-'$REDISVERSION'.tar.gz'
fi

cd $REDISPATH'/src'
./redis-server $HOME/repositories/cliques-config/redis/redis.conf