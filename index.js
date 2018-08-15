//first-party packages
const DefaultConditionHandler = require('./lib/default_conditions').DefaultConditionHandler;
const node_utils = require('@cliques/cliques-node-utils');
const urls = node_utils.urls;
const logger = require('./lib/logger');
const markupGenerator = require('./lib/markup_generator');
const tags = node_utils.tags;
const connections = require('./lib/connections');
const EXCHANGE_CONNECTION = connections.EXCHANGE_CONNECTION;

//Set up Express & create app
const USER_CONNECTION = connections.USER_CONNECTION;

//Other third party packages
const config = require('config');

/* ------------------------- MODELS ----------------------------- */

// create PublisherModels instance to access Publisher DB models
const publisherModels = new node_utils.mongodb.models.PublisherModels(EXCHANGE_CONNECTION,{read: 'secondaryPreferred'});
const cliquesModels = new node_utils.mongodb.models.CliquesModels(EXCHANGE_CONNECTION,{read: 'secondaryPreferred'});
const fraudModels = new node_utils.mongodb.models.FraudModels(EXCHANGE_CONNECTION,{read: 'secondaryPreferred'});

/* ------------------- HOSTNAME VARIABLES ------------------- */

// hostname const is external hostname, not localhost
const HTTP_HOSTNAME = config.get('Exchange.http.external.hostname');
const HTTP_EXTERNAL_PORT = config.get('Exchange.http.external.port');
const HTTPS_HOSTNAME = config.get('Exchange.https.external.hostname');
const HTTPS_EXTERNAL_PORT = config.get('Exchange.https.external.port');

/* --------------------- AUCTIONEER -----------------------*/

const br = require('./lib/auctioneer')(config.get('Exchange.auctionType'));

// First figure out which Auctioneer subclass to instantiate based on config file.
const bidder_timeout = config.get('Exchange.bidder_timeout');
let bidders;
let auctioneer;
let auctionController;
let testController;

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

/*  ------------------- Express App Init ------------------- */

const express = require('./lib/express');
const winston = require('winston');
const REDIS_CONNECTION = winston.transports.GetDefaultRedisClient();
const fraudDetector = new node_utils.fraudDetection.FraudDetector(EXCHANGE_CONNECTION, REDIS_CONNECTION, logger);
const app = express(USER_CONNECTION, fraudDetector);

/*  ------------------- DefaultConditionHandler Init ------------------- */

const adserver_hostname = config.get('AdServer.http.external.hostname');
const adserver_secure_hostname = config.get('AdServer.https.external.hostname');
const adserver_port = config.get('AdServer.http.external.port');
let defaultConditionHandler;
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
        case 'ipBlockList':
            fraudDetector.updateBlockedIPsInRedis().then(res=>{
                logger.info(`FraudDetector: MongoDB BlockedIP collection successfully stored to redis: ${res}`);
            }).catch((err) => {
                logger.error(`FraudDetector ERROR: MongoDB BlockedIP collection not stored to redis: ${err}`);
            });
            break;
        case 'uaBlockList':
            fraudDetector.updateBlockedUserAgentsInRedis().then(res=>{
                logger.info(`FraudDetector: MongoDB BlockedUserAgent collection successfully stored to redis: ${res}`);
            }).catch((err) => {
                logger.error(`FraudDetector ERROR: MongoDB BlockedUserAgent collection not stored to redis: ${err}`);
            });
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
    const secure = (request.protocol === 'https');
    const parent_tag_type = request.query.type || 'iframe'; // will be 'javascript' when called using JavaScript pub tag
    const external_port = secure ? HTTPS_EXTERNAL_PORT : HTTP_EXTERNAL_PORT;
    const pubURL = new urls.PubURL(HTTP_HOSTNAME, HTTPS_HOSTNAME, external_port);
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
    const secure = request.protocol === 'https';
    const hostname = secure ? HTTPS_HOSTNAME : HTTP_HOSTNAME;
    const external_port = secure ? HTTPS_EXTERNAL_PORT : HTTP_EXTERNAL_PORT;
    const cloaderURL = secure ? config.get('Static.CLoader.https') : config.get('Static.CLoader.http');
    const pubTag = new tags.PubTag(hostname, {
        targetId: "ad2",
        targetChildIndex: "0",
        port: external_port,
        secure: secure,
        useFactory: false,
        locationId: false,
        debug: true,
        tag_type: 'javascript',
        cloaderURL: cloaderURL
    });
    testController.test_ad(pubTag, request, response);
});

/* ------------------- EXPORTS mostly just for unittesting ------------------- */
exports.app = app;