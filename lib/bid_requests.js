var fs = require('fs');
var http = require('http');
var request = require('request');
var querystring = require('querystring');
var async = require('async');

var openrtb_bid_request = {
    "id": "80ce30c53c16e6ede735f123ef6e32361bfc7b22",
    "at": 1, "cur": [ "USD" ],
    "imp": [
        {
            "id": "1", "bidfloor": 0.03,
            "banner": {
                "h": 250, "w": 300, "pos": 0
            }
        }
    ],
    "site": {
        "id": "102855",
            "cat": [ "IAB3-1" ],
            "domain": "www.foobar.com",
            "page": "http://www.foobar.com/1234.html ",
            "publisher": {
            "id": "8953", "name": "foobar.com",
                "cat": [ "IAB3-1" ],
                "domain": "foobar.com"
            }
    },
    "device": {
        "ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/537.13 (KHTML, like Gecko) Version/5.1.7 Safari/534.57.2",
        "ip": "123.145.167.10"
    },
    "user": {
        "id": "55816b39711f9b5acf3b90e313ed29e51665623f"
    }
};

function _handle_bid_response(error,response,body,callback){
    // Contains logic to handle bid response, called in get_bids
    if (error) {
        throw error
    } else if (response.statusCode != 200 && response.statusCode != 204) {
        // return error to callback if HTTP error
        var err = "HTTP Error Returned, Status Code " + response.statusCode + ": " + body;
        return callback(err);
    } else {
        // 200 is successful, valid bid response, 204 is a "no-bid" response
        // according to OpenRTB
        var body_data = JSON.parse(body);

        //define the bid object to be passed to callback function
        //TODO: replace when bids are OpenRTB compliant
        var bid_obj = {
            "bid": body_data.bid,
            "callback_url": response.request.href,
            "status_code": response.statusCode
        };
        callback(null, bid_obj);
    }
}

function get_bids(bid_urls, callback){
    // Gets all bid responses in parallel using async.parallel
    var bids = [];
    var async_tasks = [];
    bid_urls.forEach(function(item){
        async_tasks.push(function(callback){
            request.get(item,function(error, response, body) {
                // handle each bid response here
                _handle_bid_response(error, response, body, function(err, bid_obj) {
                    if (err) throw err;
                    bids.push(bid_obj);
                    callback(); // call async callback to let it know task is done
                });
            });
        });
    });
    async.parallel(async_tasks, function(){
        // function to call when done
        callback(null, bids);
    });
}

var bid_urls = [
    "http://storage.googleapis.com/cliquesads-testbids/bid1.json",
    "http://storage.googleapis.com/cliquesads-testbids/bid2.json",
    "http://storage.googleapis.com/cliquesads-testbids/bid3.json",
    "http://storage.googleapis.com/cliquesads-testbids/bid4.json",
    "http://storage.googleapis.com/cliquesads-testbids/bid5.json",
    "http://storage.googleapis.com/cliquesads-testbids/bid6.json",
    "http://storage.googleapis.com/cliquesads-testbids/bid7.json",
    "http://storage.googleapis.com/cliquesads-testbids/bid8.json",
    "http://storage.googleapis.com/cliquesads-testbids/bid9.json",
    "http://storage.googleapis.com/cliquesads-testbids/bid10.json"
];

get_bids(bid_urls, function(err, result){
    if (err) throw err;
    console.log(result);
});

function run_auction(bids, callback){
}

function send_win_notice(price, url, callback){
}

function get_ad_markup(callback){
}

//var f = function(){
//    var k;
//    request
//        .get(
//            'http://storage.googleapis.com/cliquesads-testbids/bid1.json',
//            //{form: querystring.stringify(openrtb_bid_request)},
//            function(error, response, body) {
//                if (error) console.log(error);
//                //console.log(response);
//                k = body;
//            });
//    return k
//};
