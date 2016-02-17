/**
 * Created by bliang on 6/6/15.
 */
var node_utils = require('@cliques/cliques-node-utils');
var transports = node_utils.transports;
var bigQueryUtils = node_utils.google.bigQueryUtils;
var googleAuth = node_utils.google.auth;


if (process.env.NODE_ENV === 'production'){
    var bq_config = bigQueryUtils.loadFullBigQueryConfig('./bq_config.json');
} else {
    // use dev config if not running in production
    bq_config = bigQueryUtils.loadFullBigQueryConfig('./bq_config_dev.json','/google/bq_config_dev.json');
}
var eventStreamer = new bigQueryUtils.BigQueryEventStreamer(bq_config,
    googleAuth.DEFAULT_JWT_SECRETS_FILE,5);
var redisEventCache = new transports.RedisEventCache({ eventStreamer: eventStreamer});
redisEventCache.clearZombieEventCaches(function(err){
    if (err) return console.error(err);
    process.exit(0);
}, 1000);