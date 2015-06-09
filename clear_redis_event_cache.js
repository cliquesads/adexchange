/**
 * Created by bliang on 6/6/15.
 */
var node_utils = require('cliques_node_utils');
var transports = node_utils.transports;
var bigQueryUtils = node_utils.google.bigQueryUtils;
var googleAuth = node_utils.google.auth;


var bq_config = bigQueryUtils.loadFullBigQueryConfig('./bq_config.json');
var eventStreamer = new bigQueryUtils.BigQueryEventStreamer(bq_config,
    googleAuth.DEFAULT_JWT_SECRETS_FILE,5);
var redisEventCache = new transports.RedisEventCache({ eventStreamer: eventStreamer});
redisEventCache.clearZombieEventCaches(function(err){
    if (err) return console.error(err);
    process.exit(0);
});