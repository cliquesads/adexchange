var express = require('express');
var br = require('./lib/bid_requests');
var querystring = require('querystring');
var jade = require('jade');
var requestIp = require('request-ip');
var app = express();

//TODO: Cookie handling, logging, win-notifications,
//TODO: Update README.md, invocation-tags (client-side shit),
//TODO: Use cluster module to improve load-handling (http://nodejs.org/docs/latest/api/cluster.html)

// inside request-ip middleware handler
app.use(function(req, res, next) {
    req.clientIp = requestIp.getClientIp(req); // on localhost > 127.0.0.1
    next();
});

app.set('port', (process.env.PORT || 5100));
app.use(express.static(__dirname + '/public'));

app.get('/', function(request, response) {
    response.send('Welcome to the Cliques Ad Exchange');
});

app.listen(app.get('port'), function() {
    console.log("Node app is running at localhost:" + app.get('port'));
});

function generate_test_bid_urls(num_urls){
    // temporary function to generate bunch of test bid URLs
    //var base_url = "http://104.154.59.193:5000/bid?";
    var base_url = "http://127.0.0.1:5000/bid?";
    var urls = [];
    for (var i = 0; i < num_urls; i++) {
        var query = {
            "bidder_id": Math.round(Math.random() * 10)
        };
        urls.push(base_url + querystring.encode(query));
    }
    return urls;
}

app.get('/exchange/test_auction', function(request, response){
    // Test runs & vars
    //TODO: Add some logic here to figure out how bid urls are retrieved
    var bid_urls = generate_test_bid_urls(10);
    var winning_bid = {};
    br.get_bids(bid_urls, request, function(err, result){
        if (err) throw err;
        winning_bid = br.run_auction(result, function(err, winning_bid){
            response.status(200).json(winning_bid);
            console.log("AUCTION_INFO: Auction " + winning_bid.bidobj__id + "; ParentBidId " +
                        winning_bid.bidobj__bidid + "; BidId " + winning_bid.id + "; ImpId " +
                        winning_bid.impid);
            br.send_win_notice(winning_bid,function(err,nurl,response){
                console.log("GET request sent to " + nurl + ", Status: " + response.statusCode);
            })
        });
    });
});

//RTB Test page, just a placeholder
app.get('/rtb_test', function(request, response){
    var fn = jade.compileFile('./templates/rtb_test.jade', null);
    var html = fn();
    response.send(html);
});