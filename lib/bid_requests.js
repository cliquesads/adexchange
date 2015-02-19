var fs = require('fs');
var http = require('http');
var request = require('request');
var querystring = require('querystring');
var async = require('async');
var math = require('mathjs');

exports.get_bids = get_bids;
exports.run_auction = run_auction;

sample_bid_request = {
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
        //var body_data = JSON.parse(body);
        //define the bid object to be passed to callback function
        //var bid_obj = {
        //    "bid": Number(body_data.bid),
        //    "callback_url": response.request.href,
        //    "status_code": response.statusCode
        //};
        callback(null, JSON.parse(body));
    }
}

function get_bids(bid_urls, callback){
    // Gets all bid responses in parallel using async.parallel
    var bids = [];
    var async_tasks = [];
    bid_urls.forEach(function(item){
        async_tasks.push(function(callback){
            var post_options = {
                headers: {'content-type': 'application/json'},
                url: item,
                form: sample_bid_request
            };
            request.post(post_options,function(error, response, body) {
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

function run_auction(bid_objects, callback){
    // Runs the RTB auction

    //synchronous as far as I can tell, not including callback
    //arg bid_objects must be OpenRTB-compliant 2.3 bid-response object

    //Algorithm here is to loop over all bids only once for speed, and
    //continually store two highest bids.  If next bid > bid1, then bid2 becomes
    //bid1, and bid1 becomes the current bid.  I think this is a pretty efficient
    //way to do this but could be wrong.

    //initialize with negative price to ensure nothing will ever beat it
    var bid1 = {"price": -100};
    var bid2; //don't need to initialize with price, will immediately
    // become bid1 if bid_objects.length>1

    for (var i=0; i<bid_objects.length; i++){
        var bid_obj = bid_objects[i];
        if (bid_obj) { //have to check if bid_object is empty, as {} indicates a no-bid
            var seatbids = bid_obj.seatbid;
            for (var k=0; k<seatbids.length; k++){
                var seatbid = seatbids[k];
                var bids = seatbid.bid;
                for (var j=0; j<bids.length; j++){
                    if (bid1.price <= bids[j].price){
                        bid2 = bid1; // bump bid1 to bid2
                        bid1 = bids[j];
                        //augment with seatbid parent object values for logging/storage
                        //naming convention is to prefix key with [parent-level]__ if from
                        //parent object to avoid key collision
                        bid1.seatbid__seat_id = seatbid.seat;
                        bid1.seatbid__group = seatbid.group;
                        bid1.seatbid__ext = seatbid.ext;
                        //augment with bid response parent object values for logging/storage
                        bid1.bidobj__id = bid_obj.id;
                        bid1.bidobj__bidid = bid_obj.bidid;
                        bid1.bidobj__cur = bid_obj.cur;
                        bid1.bidobj__customdata = bid_obj.customdata;
                        bid1.bidobj__nbr = bid_obj.nbr;
                        bid1.bidobj__ext = bid_obj.ext;
                    }
                }
            }
        }
    }
    //finally, once top two bids are known, set clear price
    if (bid2) {
        bid1.clearprice = bid2.price + 0.01;
    } else {
        bid1.clearprice = bid1.price;
    }
    callback(null,bid1);
}

function send_win_notice(bid_object, callback){

}

function get_ad_markup(callback){

}