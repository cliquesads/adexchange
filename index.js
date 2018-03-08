//first-party packages
var DefaultConditionHandler = require('./lib/default_conditions').DefaultConditionHandler;
var node_utils = require('@cliques/cliques-node-utils');
var urls = node_utils.urls;
var logger = require('./lib/logger');
var markupGenerator = require('./lib/markup_generator');
var tags = node_utils.tags;
var connections = require('./lib/connections');
var EXCHANGE_CONNECTION = connections.EXCHANGE_CONNECTION;

//Set up Express & create app
var USER_CONNECTION = connections.USER_CONNECTION;
var express = require('./lib/express');
var app = express(USER_CONNECTION);

//Other third party packages
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

var br = require('./lib/auctioneer')(config.get('Exchange.auctionType'));

// First figure out which Auctioneer subclass to instantiate based on config file.
var bidder_timeout = config.get('Exchange.bidder_timeout');
var bidders;
var auctioneer;
var auctionController;
var testController;

// Refresh bidder config every n milliseconds automatically
function updateAuctioneer(){
    cliquesModels.getAllBidders(function(err, res){
        if (err) return logger.error('ERROR retrieving bidders from Mongo: ' + err);
        bidders = res;
        auctioneer = new br.Auctioneer(bidders,bidder_timeout,logger);
        auctionController = require('./lib/auction.controller')(logger, publisherModels, auctioneer, defaultConditionHandler, markupGenerator);
        testController = require('./test/test.controller')(publisherModels, auctioneer);
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
        auctionController = require('./lib/auction.controller')(logger, publisherModels, auctioneer, defaultConditionHandler, markupGenerator);
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
 * Main endpoint to handle incoming impression requests & respond with winning ad markup.
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

    // set 'form-factor' (currently only used by native placements) to "desktop" as default if not passed through.
    pubURL['form-factor'] = pubURL['form-factor'] || 'desktop';

    auctionController.main(pubURL, parent_tag_type, secure, request, response);
});

/* ----------------------- TEST PAGES ---------------------- */

/**
 * RTB Test page, just a placeholder
 */
app.get('/rtb_test', function(request, response){
    testController.rtb_test(request, response);
});

/**
 * Test ad just loads the test ad template, not the full JSON of
 * impression request, etc.
 */
app.get('/test_ad', function(request, response){
    var secure = request.protocol === 'https';
    var hostname = secure ? HTTPS_HOSTNAME : HTTP_HOSTNAME;
    var external_port = secure ? HTTPS_EXTERNAL_PORT : HTTP_EXTERNAL_PORT;
    var cloaderURL = secure ? config.get('Static.CLoader.https') : config.get('Static.CLoader.http');
    var pubTag = new tags.PubTag(hostname, {
        targetId: "ad2",
        targetChildIndex: "0",
        port: external_port,
        secure: secure,
        external: {
            fakeId: "a1b2c3d4",
            fakerId: "a1b2c3d5"
        },
        debug: true,
        tag_type: 'javascript',
        cloaderURL: cloaderURL
    });
    testController.test_ad(pubTag, request, response);
});

/* ------------------- EXPORTS mostly just for unittesting ------------------- */
exports.app = app;