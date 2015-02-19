var express = require('express');
var fs = require('fs');
var br = require('./lib/bid_requests');
var querystring = require('querystring');
var app = express();


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
    var base_url = "http://104.154.59.193:5000/bid?";
    var urls = [];
    for (var i = 0; i < num_urls; i++) {
        var query = {
            "request_id": Math.round(Math.random() * 10e7),
            "bidder_id": Math.round(Math.random() * 10e2)
        };
        urls.push(base_url + querystring.encode(query));
    }
    return urls;
}

app.get('/exchange/test_auction', function(request, response){
    // Test runs & vars
    var bid_urls = generate_test_bid_urls(10);
    var winning_bid = {};
    br.get_bids(bid_urls, function(err, result){
        if (err) throw err;
        winning_bid = br.run_auction(result, function(err, winning_bid){
            response.status(200).json(winning_bid)
        });
    });
});




