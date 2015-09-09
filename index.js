//first-party packages
var br = require('./lib/bid_requests');
var DefaultConditionHandler = require('./lib/default_conditions').DefaultConditionHandler;
var node_utils = require('cliques_node_utils');
var urls = node_utils.urls;
var cliques_cookies = node_utils.cookies;
var logging = require('./lib/exchange_logging');
var bigQueryUtils = node_utils.google.bigQueryUtils;
var googleAuth = node_utils.google.auth;
var pubsub = node_utils.google.pubsub;
var tags = node_utils.tags;

//third-party packages
//have to require PMX before express to enable monitoring
var pmx = require('pmx').init();
var express = require('express');
var https = require('https');
var http = require('http');
var app = express();
var fs = require('fs');
var querystring = require('querystring');
var jade = require('jade');
var requestIp = require('request-ip');
var winston = require('winston');
var path = require('path');
var util = require('util');
var cookieParser = require('cookie-parser');
var responseTime = require('response-time');
var config = require('config');

/* -------------------  NOTES ------------------- */

//TODO: invocation-placements (client-side shit),

/* -------------------  LOGGING ------------------- */

var logfile = path.join(
    process.env['HOME'],
    'logs',
    util.format('adexchange_%s.log',node_utils.dates.isoFormatUTCNow())
);
var chunkSize = config.get('Exchange.redis_event_cache.chunkSize');
var devNullLogger = logger = new logging.ExchangeCLogger({transports: []});
if (process.env.NODE_ENV != 'test'){
    var bq_config = bigQueryUtils.loadFullBigQueryConfig('./bq_config.json');
    var eventStreamer = new bigQueryUtils.BigQueryEventStreamer(bq_config,
        googleAuth.DEFAULT_JWT_SECRETS_FILE,chunkSize);
    logger = new logging.ExchangeCLogger({
        transports: [
            new (winston.transports.Console)({timestamp:true}),
            new (winston.transports.File)({filename:logfile,timestamp:true}),
            new (winston.transports.RedisEventCache)({ eventStreamer: eventStreamer})
        ]
    });
} else {
    // just for running unittests so whole HTTP log isn't written to console
    logger = devNullLogger;
}

/* ------------------- MONGODB - EXCHANGE DB ------------------- */

// Build the connection string
var exchangeMongoURI = util.format('mongodb://%s:%s/%s',
    config.get('Exchange.mongodb.exchange.primary.host'),
    config.get('Exchange.mongodb.exchange.primary.port'),
    config.get('Exchange.mongodb.exchange.db'));
var exchangeMongoOptions = {
    user: config.get('Exchange.mongodb.exchange.user'),
    pass: config.get('Exchange.mongodb.exchange.pwd'),
    auth: {authenticationDatabase: config.get('Exchange.mongodb.exchange.db')}
};
var EXCHANGE_CONNECTION = node_utils.mongodb.createConnectionWrapper(exchangeMongoURI, exchangeMongoOptions, function(err, logstring){
    if (err) throw err;
    logger.info(logstring);
});

// create PublisherModels instance to access Publisher DB models
var publisherModels = new node_utils.mongodb.models.PublisherModels(EXCHANGE_CONNECTION,{read: 'secondaryPreferred'});
var cliquesModels = new node_utils.mongodb.models.CliquesModels(EXCHANGE_CONNECTION,{read: 'secondaryPreferred'});


/* ------------------- MONGODB - USER DB ------------------- */

// Build the connection string
var userMongoURI = util.format('mongodb://%s:%s/%s',
    config.get('Exchange.mongodb.user.primary.host'),
    config.get('Exchange.mongodb.user.primary.port'),
    config.get('Exchange.mongodb.user.db'));

var userMongoOptions = {
    user: config.get('Exchange.mongodb.user.user'),
    pass: config.get('Exchange.mongodb.user.pwd'),
    auth: {authenticationDatabase: config.get('Exchange.mongodb.user.db')}
};
var USER_CONNECTION = node_utils.mongodb.createConnectionWrapper(userMongoURI, userMongoOptions, function(err, logstring){
    if (err) throw err;
    logger.info(logstring);
});

/* ------------------- HOSTNAME VARIABLES ------------------- */

// hostname var is external hostname, not localhost
var hostname = config.get('Exchange.http.external.hostname');
var external_port = config.get('Exchange.http.external.port');

/* ------------------- EXPRESS MIDDLEWARE ------------------- */

// inside request-ip middleware handler
app.use(function(req, res, next) {
    req.clientIp = requestIp.getClientIp(req); // on localhost > 127.0.0.1
    next();
});
app.use(cookieParser());
app.use(responseTime());
app.set('http_port', config.get('Exchange.http.port') || 5000);
app.set('https_port', config.get('Exchange.https.port') || 3000);
app.use(express.static(__dirname + '/public'));

// custom cookie-parsing middleware
var days_expiration = config.get('Cookies.expirationdays');
var domain = config.get('Cookies.domain');
var cookie_handler = new cliques_cookies.CookieHandler(days_expiration,domain,USER_CONNECTION);
app.use(function(req, res, next){
    cookie_handler.get_or_set_uuid(req, res, next);
});

// custom HTTP request logging middleware
app.use(function(req, res, next){
    logger.httpRequestMiddleware(req, res, next);
});

/* --------------------- AUCTIONEER -----------------------*/

var bidder_timeout = config.get('Exchange.bidder_timeout');
var bidders;
var auctioneer;

// Refresh bidder config every n milliseconds automatically
function updateAuctioneer(){
    cliquesModels.getAllBidders(function(err, res){
        if (err) return logger.error('ERROR retrieving bidders from Mongo: ' + err);
        bidders = res;
        auctioneer = new br.BottomUpAuctioneer(bidders,bidder_timeout,logger);
        logger.info('Got new bidder config, updated Auctioneer: ' + JSON.stringify(bidders));
    });
}

//var bidder_lookup_interval  = config.get('Exchange.bidder_lookup_interval');
// Only pull bidder config once on startup for now because
// these setInterval calls were causing too much loop delay
// for my comfort.
//setInterval(updateAuctioneer, bidder_lookup_interval);
updateAuctioneer();

/*  ------------------- DefaultConditionHandler Init ------------------- */

var adserver_hostname = config.get('AdServer.http.external.hostname');
var adserver_port = config.get('AdServer.http.external.port');
var defaultConditionHandler;
function updateDefaultHandler(){
    cliquesModels.getAllDefaultAdvertisers(function(err, defaultAdvertisers){
        if (err) return logger.error('ERROR retrieving default advertiser config from Mongo: ' + err);
        defaultConditionHandler = new DefaultConditionHandler(defaultAdvertisers, adserver_hostname, adserver_port);
        logger.info('Got new default advertiser config, updated defaultConditionHandler');
    });
}

updateDefaultHandler();

/*  ------------------- Listener for SIGUSR2, used to update exchange configs------------------- */

process.on('SIGUSR2', function() {
    logger.info('Received SIGUSR2, updating auctioneer & defaultHandler...');
    updateAuctioneer();
    updateDefaultHandler();
});

/*  ------------------- HTTP Endpoints  ------------------- */

http.createServer(app).listen(app.get('http_port'));
https.createServer({
    key: fs.readFileSync('./config/cert/star_cliquesads_com.key'),
    cert: fs.readFileSync('./config/cert/star_cliquesads_com.crt'),
    ca: fs.readFileSync('./config/cert/DigiCertCA.crt')
}, app).listen(app.get('https_port'));


app.get('/', function(request, response) {
    response.send('Welcome to the Cliques Ad Exchange');
});

/**
 * Main endpoint to handle incoming impression requests & respond with winning ad markup.
 * Does the following, in order:
 * 1) Logs incoming request
 * 2) Retrieves bids via HTTP POST requests using OpenRTB 2.3 bid request object
 * 3) Runs 2nd-price Vickrey auction based on bid-responses
 * 4) Returns winning ad markup in HTTP JSON response
 * 5) Logs response w/ winning bid metadata
 * 6) Sends win-notice via HTTP GET to winning bidder
*/
app.get(urls.PUB_PATH, function(request, response){
    // first check if incoming request has necessary query params
    if (!request.query.hasOwnProperty('pid')){
        response.status(404).send("ERROR 404: Page not found - no placement_id parameter provided.");
        logger.error('GET Request sent to /pub with no placement_id');
        return
    }

    // parse using PubURL object in case you ever want to add additional
    // query params, encoding, parsing, etc.
    var pubURL = new urls.PubURL(hostname, external_port);
    var secure = (request.protocol == 'https');
    pubURL.parse(request.query, secure);

    publisherModels.getNestedObjectById(pubURL.pid,'Placement', ['sites.pages.clique','sites.clique'], function(err, placement){
        if (err) {
            // Fail if placement can't even be looked up.
            response.status(404).send("ERROR 404: Placement ID " + pubURL.pid + " not found.");
            logger.error("GET Request send to /pub with invalid placement_id: " + pubURL.pid);
        } else {
            auctioneer.main(placement, request, response, function(err, winning_bid, bid_request){
                if (err) {
                    // handle default condition if error
                    defaultConditionHandler.main(bid_request, placement, secure, function(err, markup){
                        if (err){
                            response.status(404).send("ERROR 404: Cannot get default creative");
                            logger.error('ERROR retrieving markup for default condition: ' + err);
                        }
                        response.send(markup);
                    });
                } else {
                    //TODO: this is pretty hacky and makes me uncomfortable but I just don't have time to
                    // find a better way now
                    var markup = urls.expandURLMacros(winning_bid.adm, { impid: winning_bid.impid, pid: pubURL.pid });
                    response.send(markup);
                }
                logger.httpResponse(response);
                logger.auction(err, placement, request, response, winning_bid, bid_request);
            });
        }
    });
});

/* ----------------------- TEST PAGES ---------------------- */

/**
 * RTB Test page, just a placeholder
 */
app.get('/rtb_test', function(request, response){
    // fake the referer address just for show in the request data object
    request.headers.referer = 'http://' + request.headers['host'] + request.originalUrl;
    // generate request data again just for show
    request.query = {"pid": "55d66175a9f9bf9d040232fc"};
    var qs = querystring.encode(request.query);
    publisherModels.getNestedObjectById(request.query.pid,'Placement', function(err, placement) {
        if (err) logger.error(err);
        auctioneer._create_single_imp_bid_request(placement, request, function (err, request_data) {
            var fn = jade.compileFile('./templates/rtb_test.jade', null);
            var html = fn({request_data: JSON.stringify(request_data, null, 2), qs: qs});
            response.send(html);
        });
    });
});

/**
 * RTB Test page, just a placeholder
 */
app.get('/test_ad', function(request, response){
    // generate request data again just for show
    var pubTag = new tags.PubTag(hostname, { port: external_port });
    publisherModels.getNestedObjectById('55d66148afba0f9504bc5a86','Placement', function(err, placement) {
        if (err) console.log(err);
        var rendered = pubTag.render(placement);
        var fn = jade.compileFile('./templates/test_ad.jade', null);
        var html = fn({ pubtag: rendered });
        response.send(html);
    });
});

/* ------------------- EXPORTS mostly just for unittesting ------------------- */

exports.app = app;
exports.exchangeMongoURI = exchangeMongoURI;
exports.exchangeMongoOptions = exchangeMongoOptions;
exports.userMongoURI = userMongoURI;
exports.userMongoOptions = userMongoOptions;
exports.devNullLogger = devNullLogger;