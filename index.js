//first-party packages
var br = require('./lib/bid_requests');
var DefaultConditionHandler = require('./lib/default_conditions').DefaultConditionHandler;
var node_utils = require('@cliques/cliques-node-utils');
var urls = node_utils.urls;
var logger = require('./lib/logger');
var tags = node_utils.tags;
var connections = require('./lib/connections');
var EXCHANGE_CONNECTION = connections.EXCHANGE_CONNECTION;

//Set up Express & create app
var USER_CONNECTION = connections.USER_CONNECTION;
var express = require('./lib/express');
var app = express(USER_CONNECTION);

//Other third party packages
var querystring = require('querystring');
var jade = require('jade');
var path = require('path');
var config = require('config');

/* ------------------------- MODELS ----------------------------- */

// create PublisherModels instance to access Publisher DB models
var publisherModels = new node_utils.mongodb.models.PublisherModels(EXCHANGE_CONNECTION,{read: 'secondaryPreferred'});
var cliquesModels = new node_utils.mongodb.models.CliquesModels(EXCHANGE_CONNECTION,{read: 'secondaryPreferred'});

/* ------------------- HOSTNAME VARIABLES ------------------- */

// hostname var is external hostname, not localhost
var HTTP_HOSTNAME = config.get('Exchange.http.external.hostname');
var HTTP_EXTERNAL_PORT = config.get('Exchange.http.external.port');
var HTTPS_HOSTNAME = config.get('Exchange.https.external.hostname');
var HTTPS_EXTERNAL_PORT = config.get('Exchange.https.external.port');

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

// Only pull bidder config once on startup for now because
// these setInterval calls were causing too much loop delay
// for my comfort.
updateAuctioneer();

/*  ------------------- DefaultConditionHandler Init ------------------- */

var adserver_hostname = config.get('AdServer.http.external.hostname');
var adserver_secure_hostname = config.get('AdServer.https.external.hostname');
var adserver_port = config.get('AdServer.http.external.port');
var defaultConditionHandler;
function updateDefaultHandler(){
    cliquesModels.getAllDefaultAdvertisers(function(err, defaultAdvertisers){
        if (err) return logger.error('ERROR retrieving default advertiser config from Mongo: ' + err);
        defaultConditionHandler = new DefaultConditionHandler(defaultAdvertisers, adserver_hostname, adserver_secure_hostname, adserver_port);
        logger.info('Got new default advertiser config, updated defaultConditionHandler');
    });
}
updateDefaultHandler();

/*  ------------------- Listener for SIGUSR2, used to update exchange configs------------------- */

process.on('message', function(packet) {
    logger.info('Received message: ' + JSON.stringify(packet.data));
    switch (packet.data.update){
        case 'bidderConfig':
            updateAuctioneer();
            break;
        case 'defaultsConfig':
            updateDefaultHandler();
            break;
        default:
            console.log('Sorry, couldn\'t understand this `update` message');
    }
});

/*  ------------------- HTTP Endpoints  ------------------- */

app.get('/', function(request, response) {
    response.send('Welcome to the Cliques Ad Exchange');
});

/**
 * It's too complicated now to figure out how to toggle creative markup
 * for http/https in the bidder, so this is a horrible hack to do it before
 * rendering the ad tag instead.  Basically just replacing non-secure for
 * secure adserver host in ad markup returned from bidder.
 * @param adm
 */
var horribleHttpsAdMarkupHack = function(adm){
    var httpAdserverUrl = 'http://' + adserver_hostname;
    var httpsAdserverUrl = 'https://' + adserver_secure_hostname;
    return adm.replace(httpAdserverUrl, httpsAdserverUrl);
};

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
    var secure = (request.protocol == 'https');
    var parent_tag_type = request.query.type || 'iframe'; // will be 'javascript' when called using JavaScript pub tag
    var external_port = secure ? HTTPS_EXTERNAL_PORT : HTTP_EXTERNAL_PORT;
    var pubURL = new urls.PubURL(HTTP_HOSTNAME, HTTPS_HOSTNAME, external_port);
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
                    defaultConditionHandler.main(bid_request, placement, secure, parent_tag_type, function(err, markup, defaultType){
                        if (err){
                            response.status(404).send("ERROR 404: Cannot get default condition markup");
                        }
                        response.send(markup);
                        logger.auction_default(err, placement, defaultType, request, bid_request);
                    });
                } else {
                    //TODO: this is pretty hacky and makes me uncomfortable but I just don't have time to
                    // find a better way now
                    var adm = secure ? horribleHttpsAdMarkupHack(winning_bid.adm) : winning_bid.adm;
                    var markup = urls.expandURLMacros(adm, {
                        impid: winning_bid.impid, pid: pubURL.pid, ref: encodeURIComponent(request.get('Referrer'))
                    });
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
var TEST_PLACEMENT = "59162c33a2a66102be6e2001";
app.get('/rtb_test', function(request, response){
    // fake the referer address just for show in the request data object
    request.headers.referer = 'http://' + request.headers['host'] + request.originalUrl;
    // generate request data again just for show
    request.query = {"pid": TEST_PLACEMENT};
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

    var secure = request.protocol === 'https';
    var hostname = secure ? HTTPS_HOSTNAME : HTTP_HOSTNAME;
    var external_port = secure ? HTTPS_EXTERNAL_PORT : HTTP_EXTERNAL_PORT;
    var cloaderURL = secure ? config.get('Static.CLoader.https') : config.get('Static.CLoader.http');
    var pubTag = new tags.PubTag(hostname, {
        port: external_port,
        secure: secure,
        tag_type: 'iframe',
        cloaderURL: cloaderURL
    });

    publisherModels.getNestedObjectById(TEST_PLACEMENT,'Placement', function(err, placement) {
        if (err) console.log(err);
        var rendered = pubTag.render(placement);
        var fn = jade.compileFile('./templates/test_ad.jade', null);
        var html = fn({ pubtag: rendered });
        response.send(html);
    });
});

/* ------------------- EXPORTS mostly just for unittesting ------------------- */

exports.app = app;
exports.exchangeMongoURI = connections.exchangeMongoURI;
exports.exchangeMongoOptions = connections.exchangeMongoOptions;
exports.userMongoURI = connections.userMongoURI;
exports.userMongoOptions = connections.userMongoOptions;
exports.devNullLogger = logger.devNullLogger;