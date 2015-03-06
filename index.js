//first-party packages
var br = require('./lib/bid_requests');
var node_utils = require('cliques_node_utils');
var cliques_cookies = require('./lib/cookies');

//have to require PMX before express to enable monitoring
var pmx = require('pmx').init();

//third-party packages
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

//TODO: invocation-tags (client-side shit),
//TODO: figure out pub tag taxonomy,
//TODO: unit tests (some simple ones)

/*  BEGIN logging setup     */
var logfile = path.join(
    process.env['HOME'],
    'logs',
    util.format('adexchange_%s.log',node_utils.dates.isoFormatUTCNow())
);
var logger = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({timestamp:true}),
        new (winston.transports.File)({filename:logfile,timestamp:true})
    ]
});
/*  END Logging setup   */

// Only enable Nodetime in local test env
if (process.env.NODE_ENV == 'local-test'){
    require('nodetime').profile({
        accountKey: config.get('Exchange.nodetime.license_key'),
        appName: config.get('Exchange.nodetime.appName')
    });
}

/*  BEGIN EXPRESS MIDDLEWARE    */

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

/*  END EXPRESS MIDDLEWARE  */

/*  HTTP Endpoints  */
app.get('/', function(request, response) {
    response.send('Welcome to the Cliques Ad Exchange');
});

app.listen(app.get('port'), function() {
    logger.info("Node app is running at localhost:" + app.get('port'));
});

var TEST_BID_URL = [config.get('Exchange.bidder.url') + querystring.encode({'bidder_id': 1}),
                    config.get('Exchange.bidder.url') + querystring.encode({'bidder_id': 2})];

//function generate_test_bid_url(){
//    // temporary function to generate bunch of test bid URLs
//    // TODO REPLACE
//    var bidder_url = config.get('Exchange.bidder.url');
//    //var urls = [];
//    //for (var i = 0; i < num_urls; i++) {
//    var query = {
//        "bidder_id": 1
//    };
//    url = bidder_url + querystring.encode(query);
//        //urls.push(bidder_url + querystring.encode(query));
//    //}
//    return urls;
//}

app.get('/pub', function(request, response){
    /*  Main function to handle incoming impression requests & respond with winning ad markup.

    Does the following, in order:
    1) Logs incoming request
    2) Retrieves bids via HTTP POST requests using OpenRTB 2.3 bid request object
    3) Runs 2nd-price Vickrey auction based on bid-responses
    4) Returns winning ad markup in HTTP JSON response
    5) Logs response w/ winning bid metadata
    6) Sends win-notice via HTTP GET to winning bidder */


    //TODO: Add some logic here to figure out how bid urls are retrieved
    var bid_urls = TEST_BID_URL;

    // log request, add uuid metadata
    node_utils.logging.log_request(logger,request,
        { 'req_uuid':request.old_uuid, 'uuid': request.uuid });

    // now do the hard stuff
    // TODO: this error handling is a mess, should be able to be simplified into
    // TODO: one wrapper try/catch but I can't get it to work
    try {
        br.get_bids(bid_urls, request, logger, function (err, result) {
            if (err) throw err;
            br.run_auction(result, function (er, winning_bid) {
                //this doesn't really work as expected, not throwing and being caught by
                //try clause
                if (er) {
                    //throw er;
                    br.handle_default_condition(request, response);
                    logger.error(er);
                    return
                }
                response.status(200).json(winning_bid);
                var auction_meta = {
                    bidobj__id: winning_bid.bidobj__id,
                    bidobj__bidid: winning_bid.bidobj__bidid,
                    bidid: winning_bid.id,
                    impid: winning_bid.impid,
                    adid: winning_bid.adid,
                    bid1: winning_bid.price,
                    clearprice: winning_bid.clearprice
                };
                node_utils.logging.log_response(logger, response, auction_meta);
                br.send_win_notice(winning_bid, function (err, nurl, response) {
                    if (err) throw err;
                    var win_notice_meta = {
                        type: 'win-notice',
                        nurl: nurl,
                        statusCode: response.statusCode
                    };
                    logger.info("WIN-NOTICE", win_notice_meta);
                });
            });
        });
    } catch (e){
        br.handle_default_condition(request, response);
        logger.error(e);
    }
});

//RTB Test page, just a placeholder
app.get('/rtb_test', function(request, response){
    // fake the referer address just for show in the request data object
    request.headers.referer = 'http://' + request.headers['host'] + request.originalUrl;
    // generate request data again just for show
    request.query = {"tag_id": "54f8df2e6bcc85d9653becfb"};
    var qs = querystring.encode(request.query);
    br._create_single_imp_bid_request(request,function(err,request_data){
        var fn = jade.compileFile('./templates/rtb_test.jade', null);
        var html = fn({request_data: JSON.stringify(request_data, null, 2), qs: qs});
        node_utils.logging.log_request(logger, request);
        response.send(html);
        node_utils.logging.log_response(logger, response);
    });
});