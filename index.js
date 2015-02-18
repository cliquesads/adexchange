var express = require('express');
var math = require('mathjs');
var fs = require('fs');
var http = require('http');
var br = require('./lib/bid_requests');

var app = express();

app.set('port', (process.env.PORT || 5000));
app.use(express.static(__dirname + '/public'));

app.get('/', function(request, response) {
    response.send('Hello World!');
});

app.listen(app.get('port'), function() {
    console.log("Node app is running at localhost:" + app.get('port'));
});

app.get('/exchange/bids', function(request, response) {
    response.send('<h1>This is an exchange</h1><p>Dont really know what im doing</p>');
});

app.get('/exchange/test_auction', function(request, response){
    response.send(main(request, response))
});



function main(request, response){
    var bids;
}




