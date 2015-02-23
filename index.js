//first-party packages
var br = require('./lib/bid_requests');
var node_utils = require('cliques_node_utils');

//third-party packages
var express = require('express');
var app = express();
var querystring = require('querystring');
var jade = require('jade');
var requestIp = require('request-ip');
var winston = require('winston');
var path = require('path');
var util = require('util');
var responseTime = require('response-time');

//TODO: Cookie handling, logging, win-notifications,
//TODO: Update README.md, invocation-tags (client-side shit),
//TODO: Use cluster module to improve load-handling (http://nodejs.org/docs/latest/api/cluster.html)

/*
BEGIN Environment detection & configuraton
 */
var NODE_ENV = process.env.NODE_ENV || 'local'; //default to local
if (NODE_ENV == 'local') {
    var bidder_url = "http://127.0.0.1:5000/bid?";
    var logfile = path.join(process.env['HOME'],'logs',util.format('adexchange_%s.log',Date.now()));
    var logger = new (winston.Logger)({
        transports: [
            new (winston.transports.Console)({timestamp:true}),
            new (winston.transports.File)({filename:logfile,timestamp:true})
        ]
    });
} else if (NODE_ENV == 'production') {
    bidder_url = "http://104.154.59.193:5000/bid?";
    logger = new (winston.Logger)({
        transports: [
            new (winston.transports.Console)({timestamp:true})
        ]
    });
}
/*
END Env. detection & config
 */


/*
BEGIN EXPRESS MIDDLEWARE
*/

// inside request-ip middleware handler
app.use(function(req, res, next) {
    req.clientIp = requestIp.getClientIp(req); // on localhost > 127.0.0.1
    next();
});
app.use(responseTime());
app.set('port', (process.env.PORT || 5100));
app.use(express.static(__dirname + '/public'));

/* END EXPRESS MIDDLEWARE */


/*
    HTTP Endpoints
 */

app.get('/', function(request, response) {
    response.send('Welcome to the Cliques Ad Exchange');
});

app.listen(app.get('port'), function() {
    logger.info("Node app is running at localhost:" + app.get('port'));
});

function generate_test_bid_urls(num_urls){
    // temporary function to generate bunch of test bid URLs
    //var base_url = "http://104.154.59.193:5000/bid?";
    var urls = [];
    for (var i = 0; i < num_urls; i++) {
        var query = {
            "bidder_id": Math.round(Math.random() * 10)
        };
        urls.push(bidder_url + querystring.encode(query));
    }
    return urls;
}

app.get('/exchange/test_auction', function(request, response){
    // Test runs & vars
    //TODO: Add some logic here to figure out how bid urls are retrieved
    var bid_urls = generate_test_bid_urls(10);
    var winning_bid = {};
    node_utils.logging.log_request(logger,request);
    br.get_bids(bid_urls, request, function(err, result){
        if (err) {

            logger.error(err);
            // TODO: figure out what default response is if no winning bid comes back

        } else{
            winning_bid = br.run_auction(result, function(err, winning_bid){
                response.status(200).json(winning_bid);
                //log response

                //log auction info
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
                //logger.info("AUCTION %s", winning_bid.bidobj__id, auction_meta);

                br.send_win_notice(winning_bid,function(err,nurl,response){
                    //TODO: handle errors better here
                    if (err){
                        logger.error(err);
                    }
                    var win_notice_meta = {
                        type: 'win-notice',
                        nurl: nurl,
                        statusCode: response.statusCode
                    };
                    logger.info("WIN-NOTICE request-url=%s status=%s", nurl, response.statusCode, win_notice_meta);
                });
            });
        }
    });
});

//RTB Test page, just a placeholder
app.get('/rtb_test', function(request, response){
    var fn = jade.compileFile('./templates/rtb_test.jade', null);
    var html = fn();
    node_utils.logging.log_request(logger, request);
    response.send(html);
    node_utils.logging.log_response(logger, response);
});