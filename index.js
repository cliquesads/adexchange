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
var url = require('url');
var uuid = require('node-uuid');
var cookieParser = require('cookie-parser');
var redis = require('redis');
var responseTime = require('response-time');
var config = require('config');
require('date-utils'); // hook for date-utils module

//TODO: Cookie handling
//TODO: invocation-tags (client-side shit),
//TODO: Use cluster module to improve load-handling (http://nodejs.org/docs/latest/api/cluster.html)

//TODO: this is just a hack to prevent Heroku build from failing due to log file creation, remove once
//TODO: you migrate to something else
var NODE_ENV = process.env.NODE_ENV || 'local'; //default to local
if (NODE_ENV == 'local') {
    var logfile = path.join(process.env['HOME'],'logs',util.format('adexchange_%s.log',Date.now()));
    var logger = new (winston.Logger)({
        transports: [
            new (winston.transports.Console)({timestamp:true}),
            new (winston.transports.File)({filename:logfile,timestamp:true})
        ]
    });
} else if (NODE_ENV == 'production') {
    logger = new (winston.Logger)({
        transports: [
            new (winston.transports.Console)({timestamp:true})
        ]
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
app.set('port', (process.env.PORT || 5100));
app.use(express.static(__dirname + '/public'));
/*  END EXPRESS MIDDLEWARE  */

///*  BEGIN Redis Configuration   */
//var redisURL = url.parse(config.get('Exchange.redis.rediscloud_url'));
//var client = redis.createClient(redisURL.port, redisURL.hostname, { no_ready_check: true });
//client.auth(redisURL.auth.split(':')[1]);
///*  END Redis Configuration */
//
///* Cookie/Redis setup */
//var Cookie = tough.Cookie;
//var redisCookieJar = new tough.CookieJar(new redisCookieStore(client));


/*  HTTP Endpoints  */
app.get('/', function(request, response) {
    response.send('Welcome to the Cliques Ad Exchange');
});
app.listen(app.get('port'), function() {
    logger.info("Node app is running at localhost:" + app.get('port'));
});

function generate_test_bid_urls(num_urls){
    // temporary function to generate bunch of test bid URLs
    var bidder_url = config.get('Exchange.bidder.url');
    var urls = [];
    for (var i = 0; i < num_urls; i++) {
        var query = {
            "bidder_id": Math.round(Math.random() * 10)
        };
        urls.push(bidder_url + querystring.encode(query));
    }
    return urls;
}

function get_or_set_cookie(request, response, new_cookie_vals, days_expiration, callback){
    /*
        Handles cookie setting & getting for exchange cookies.

        If cookie key,val is found in request (for each key,val passed in new_cookie_vals object)
        then that cookie's expiration is updated and existing key,val are returned.

        If not, then set cookie & return the new key,val pair
     */

    days_expiration = days_expiration || 30; // set 30-day default
    var max_age = days_expiration * 24 * 60 * 60 * 1000;
    var now = new Date;
    var expiration = now.addDays(days_expiration);
    var secure = false;
    if (request.protocol == 'https'){
        secure = true;
    }
    var cookie_options = {'maxAge': max_age, 'expires': expiration, 'secure': secure};
    var results = {};
    for (var key in new_cookie_vals){
        if (new_cookie_vals.hasOwnProperty(key)) {
            if (request.cookies[key]) {
                var val = request.cookies[key];
                response.cookie(key, val, cookie_options);
                results[key] = val;
            } else {
                response.cookie(key, new_cookie_vals[key], cookie_options);
                results[key] = new_cookie_vals[key];
            }
        }
    }
    callback(null, results);
}

app.get('/exchange/test_auction', function(request, response){
    // Test runs & vars
    //TODO: Add some logic here to figure out how bid urls are retrieved
    var bid_urls = generate_test_bid_urls(10);
    var winning_bid = {};
    node_utils.logging.log_request(logger,request);

    //var cookie = Cookie.parse(request.headers);
    get_or_set_cookie(request, response,{'uuid': uuid.v1()},30,function(err,cookie){
        console.log(cookie)
    });

    br.get_bids(bid_urls, request, function(err, result){
        if (err) {

            logger.error(err);
            // TODO: figure out what default response is if no winning bid comes back

        } else {
            winning_bid = br.run_auction(result, function(err, winning_bid){
                //get_or_set_cookie(request, response, 30, function(err, cookie){
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
                //logger.info("AUCTION %s", winning_bid.bidobj__id, auction_meta);

                br.send_win_notice(winning_bid,function(err,nurl,response){
                    //TODO: handle errors better here
                    if (err) {
                        logger.error(err);
                    }
                    var win_notice_meta = {
                        type: 'win-notice',
                        nurl: nurl,
                        statusCode: response.statusCode
                    };
                    logger.info("WIN-NOTICE", win_notice_meta);
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