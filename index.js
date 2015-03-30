//first-party packages
var br = require('./lib/bid_requests');
var node_utils = require('cliques_node_utils');
var cliques_cookies = node_utils.cookies;
var logging = require('./lib/exchange_logging');
var db = node_utils.mongodb;

//third-party packages
//have to require PMX before express to enable monitoring
var pmx = require('pmx').init();
var express = require('express');
var app = express();
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

//TODO: invocation-tags (client-side shit),
//TODO: unit tests (some simple ones)

/* -------------------  LOGGING ------------------- */

var logfile = path.join(
    process.env['HOME'],
    'logs',
    util.format('adexchange_%s.log',node_utils.dates.isoFormatUTCNow())
);

var devNullLogger = logger = new (logging.ExchangeCLogger)({transports: []});
if (process.env.NODE_ENV != 'test'){
    var logger = new (logging.ExchangeCLogger)({
        transports: [
            new (winston.transports.Console)({timestamp:true}),
            new (winston.transports.File)({filename:logfile,timestamp:true})
        ]
    });
} else {
    // just for running unittests so whole HTTP log isn't written to console
    logger = devNullLogger;
}

/* -------------------  DEBUGGING/PROFILING ------------------- */

//// Only enable Nodetime in local test env
//if (process.env.NODE_ENV == 'local-test'){
//    require('nodetime').profile({
//        accountKey: config.get('Exchange.nodetime.license_key'),
//        appName: config.get('Exchange.nodetime.appName')
//    });
//}

/* ------------------- MONGODB - EXCHANGE DB ------------------- */

// Build the connection string
var mongoURI = util.format('mongodb://%s:%s/%s',
    config.get('Exchange.mongodb.secondary.host'),
    config.get('Exchange.mongodb.secondary.port'),
    config.get('Exchange.mongodb.db'));

var mongoOptions = {
    user: config.get('Exchange.mongodb.user'),
    pass: config.get('Exchange.mongodb.pwd'),
    auth: {authenticationDatabase: config.get('Exchange.mongodb.db')}
};
var EXCHANGE_CONNECTION = db.createConnectionWrapper(mongoURI, mongoOptions, function(err, logstring){
    if (err) throw err;
    logger.info(logstring);
});

/* ------------------- EXPRESS MIDDLEWARE ------------------- */

// inside request-ip middleware handler
app.use(function(req, res, next) {
    req.clientIp = requestIp.getClientIp(req); // on localhost > 127.0.0.1
    next();
});
app.use(cookieParser());
app.use(responseTime());
app.set('port', (config.get('Exchange.http.port') || 5000));
app.use(express.static(__dirname + '/public'));

// custom cookie-parsing middleware
app.use(cliques_cookies.get_or_set_uuid);

// custom HTTP request & response logging middleware
app.use(logger.httpRequestMiddleware);
app.use(logger.httpResponseMiddleware);

/* --------------------- AUCTIONEER -----------------------*/

var bidder_timeout = config.get('Exchange.bidder_timeout');
var bidders = config.get('Exchange.bidders');
var auctioneer = new br.Auctioneer(bidders,bidder_timeout,EXCHANGE_CONNECTION,logger);

/*  ------------------- HTTP Endpoints  ------------------- */

app.listen(app.get('port'), function() {
    logger.info("Cliques Ad Exchange is running at localhost:" + app.get('port'));
});

app.get('/', function(request, response) {
    response.send('Welcome to the Cliques Ad Exchange');
});

function default_condition(response){
    // TODO: make a DB call here to get default
    return response.json({"adm": config.get('Exchange.defaultcondition.300x250'), "default": true}).status(200);
}

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
app.get('/pub', function(request, response){
    // log request, add uuid metadata
    //node_utils.logging.log_request(logger,request,
    //    { 'req_uuid':request.old_uuid, 'uuid': request.uuid });

    // first check if incoming request has necessary query params
    if (!request.query.hasOwnProperty('tag_id')){
        response.status(404).send("ERROR 404: Page not found - no tag_id parameter provided.");
        logger.error('GET Request sent to /pub with no tag_id');
        return
    }
    // now do the hard stuff
    auctioneer.main(request, response, function(err, winning_bid){
        logger.impression(err, request, response, winning_bid);
        if (err) {
            default_condition(response);
        }
    });
});

/**
 * RTB Test page, just a placeholder
 */
app.get('/rtb_test', function(request, response){
    // fake the referer address just for show in the request data object
    request.headers.referer = 'http://' + request.headers['host'] + request.originalUrl;
    // generate request data again just for show
    request.query = {"tag_id": "54f8df2e6bcc85d9653becfb"};
    var qs = querystring.encode(request.query);
    auctioneer._create_single_imp_bid_request(request,function(err,request_data){
        var fn = jade.compileFile('./templates/rtb_test.jade', null);
        var html = fn({request_data: JSON.stringify(request_data, null, 2), qs: qs});
        node_utils.logging.log_request(logger, request);
        response.send(html);
        node_utils.logging.log_response(logger, response);
    });
});

/* ------------------- EXPORTS mostly just for unittesting ------------------- */

exports.app = app;
exports.mongoURI = mongoURI;
exports.mongoOptions = mongoOptions;
exports.devNullLogger = devNullLogger;