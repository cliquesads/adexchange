//first-party packages
var node_utils = require('@cliques/cliques-node-utils');
var logging = require('./exchange_logging');
var bigQueryUtils = node_utils.google.bigQueryUtils;
var googleAuth = node_utils.google.auth;

//third-party packages
//have to require PMX before express to enable monitoring
var winston = require('winston');
var path = require('path');
var util = require('util');
var config = require('config');


var logfile = path.join(
    process.env['HOME'],
    'logs',
    util.format('adexchange_%s.log',node_utils.dates.isoFormatUTCNow())
);

// Set number of records to keep in Redis event-type cache at any given time
var chunkSize = config.get('Exchange.logger.redis_event_cache.chunkSize');

// Fake logger just for testing
var devNullLogger = logger = exports.devNullLogger = new logging.ExchangeCLogger({transports: []});

if (process.env.NODE_ENV !== 'test'){
    // set up production logger
    const adEventDataset = config.get("Exchange.logger.bigQuery.adEventDataset");
    const httpEventDataset = config.get("Exchange.logger.bigQuery.httpEventDataset");
    var bq_config = bigQueryUtils.loadFullBigQueryConfig('./bq_config.json', httpEventDataset, adEventDataset);
    var eventStreamer = new bigQueryUtils.BigQueryEventStreamer(bq_config,
        googleAuth.DEFAULT_JWT_SECRETS_FILE,chunkSize);
    logger = new logging.ExchangeCLogger({
        transports: [
            new (winston.transports.Console)({timestamp:true}),
            new (winston.transports.File)({ filename:logfile, timestamp:true, maxsize: 1073741824, zippedArchive: true }),
            new (winston.transports.RedisEventCache)({ eventStreamer: eventStreamer})
        ]
    });
} else {
    // just for running unittests so whole HTTP log isn't written to console
    logger = devNullLogger;
}

module.exports = logger;
