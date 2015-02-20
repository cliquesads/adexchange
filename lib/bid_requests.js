var fs = require('fs');
var http = require('http');
var request = require('request');
var async = require('async');
var uuid = require('node-uuid');

exports.get_bids = get_bids;
exports.run_auction = run_auction;

function _handle_bid_response(error,response,body,callback){
    // Contains logic to handle bid response, called in get_bids
    if (error) {
        throw error
    } else if (response.statusCode != 200 && response.statusCode != 204) {
        // return error to callback if HTTP error
        var err = "HTTP Error Returned, Status Code " + response.statusCode + ": " + body;
        return callback(err);
    } else {
        callback(null, JSON.parse(body));
    }
}

/*  The following functions process incoming request and parse out parameters
    to provide in bid request. Convention is to use ONE FUNCTION PER
    SECOND-LEVEL OPENRTB RESPONSE OBJECT unless otherwise noted. */

/*
 ============= BEGIN REQUEST PARSERS ===========
 */

function _parse_bid_data(req,callback){
    var bid_data = {
        "id": uuid.v1(),
        "at": 2, // 1 = first price auction, 2 = second price auction
        "cur": [ "USD" ] // Array of allowed currencies for bids on this bid request using ISO-4217 alpha codes
    };
    callback(null, bid_data);
}

function _parse_imp_data(req,callback){
    //TODO: add more stuff here
    var imp_data = [{
            "id": +process.hrtime().join(''), //randomly generate impid based on timestamp
            "bidfloor": 0.03,
            "banner": {
                "h": 250, "w": 300, "pos": 0
            }
        }];
    imp_data[0].banner.h = req.query.h;
    imp_data[0].banner.w = req.query.w;
    imp_data[0].banner.pos = req.query.pos;
    callback(null,imp_data);
}

function _parse_device_data(req, callback){
    //TODO: add in more advanced UA & Geo parsing here
    var device_data = {
        "ua": req.headers["user-agent"],
        "ip": req.clientIp
    };
    callback(null, device_data);
}

function _parse_user_data(req, callback){
    //TODO: Write this, and implement cookie-parsing middleware
    var user_data = {"id": "9u904jufbhi49uduo4n48"}; //FAKE
    callback(null, user_data);
}

function _parse_site_data(req, callback){
    //TODO: Write this, parse incoming URL & taxonomy of publisher based
    //TODO: on some persistent datastore
    var site_data = {
            "id": "102855",
            "cat": [ "IAB3-1" ],
            "domain": "cliquesexchange.herokuapp.com",
            "page": "http://www.foobar.com/1234.html",
            "publisher": {
            "id": "8953", "name": "foobar.com",
                "cat": [ "IAB3-1" ],
                "domain": "foobar.com"
        }
    };
    callback(null, site_data);
}

/*
============= END REQUEST PARSERS ===========
*/

function _create_single_imp_bid_request(req, cb){
    // Main function to create single bid request.  Runs all parsing functions in parallel.

    //run parsing functions in parallel
    var request_data = {};
    async.parallel(
        [
            function(callback){
                _parse_bid_data(req, function(err,bid_data){
                    if (err) throw err;
                    request_data.id = bid_data.id;
                    request_data.cur = bid_data.cur;
                    request_data.at = bid_data.at;
                    callback();
                });
            },
            function(callback){
                _parse_device_data(req, function(err,device_data){
                    if (err) throw err;
                    request_data.device = device_data;
                    callback();
                });
            },
            function(callback){
                _parse_user_data(req, function(err,user_data) {
                    if (err) throw err;
                    request_data.user = user_data;
                    callback();
                });
            },
            function(callback) {
                _parse_site_data(req, function (err, site_data) {
                    if (err) throw err;
                    request_data.site = site_data;
                    callback(null, request_data);
                });
            },
            function(callback) {
                _parse_imp_data(req, function (err, imp_data) {
                    if (err) throw err;
                    request_data.imp = imp_data;
                    callback(null, request_data);
                });
            }
        ],
        function(){
            cb(null, request_data);
        }
    );
}

/* BEGIN publicly exposed functions to handle the heavy lifting, i.e.
 *  shooting out bid requests, running the auction, and sending win notices. */

function get_bids(bid_urls, req, cb){
    // Gets all bid responses in parallel using async.parallel
    var bids = [];
    var async_tasks = [];
    bid_urls.forEach(function(item){
        async_tasks.push(function(callback){
            var post_options = {
                headers: {'content-type': 'application/json'},
                url: item,
                form: null
            };
            _create_single_imp_bid_request(req, function(err,request_data){
                if (err) throw err;
                post_options.form = request_data;
                request.post(post_options,function(error, response, body) {
                    // handle each bid response here
                    // TODO: Set timeouts and handle 500 errors
                    _handle_bid_response(error, response, body, function(err, bid_obj) {
                        if (err) throw err;
                        bids.push(bid_obj);
                        callback(); // call async callback to let it know task is done
                    });
                });
            });
        });
    });
    async.parallel(async_tasks, function(){
        // function to call when done
        cb(null, bids);
    });
}

function run_auction(bid_objects, callback){
    // Runs the RTB auction

    //synchronous as far as I can tell, not including callback
    //arg bid_objects must be OpenRTB-compliant 2.3 bid-response object

    //Works for arbitrary number of seatbids per bid object, and arbitrary number
    //of bids per seatbid

    //Algorithm here is to loop over all bids only once for speed, and
    //continually store two highest bids.  If next bid > bid1, then bid2 becomes
    //bid1, and bid1 becomes the current bid.  I think this is a pretty efficient
    //way to do this but could be wrong.

    //initialize with negative price to ensure nothing will ever beat it
    var bid1 = {"price": -100};
    var bid2 = {"price": -100}; //don't need to initialize with price, will immediately
    // become bid1 if bid_objects.length>1

    for (var i=0; i<bid_objects.length; i++){
        var bid_obj = bid_objects[i];
        if (bid_obj) { //have to check if bid_object is empty, as {} indicates a no-bid
            var seatbids = bid_obj.seatbid;
            for (var k=0; k<seatbids.length; k++){
                var seatbid = seatbids[k];
                var bids = seatbid.bid;
                for (var j=0; j<bids.length; j++){
                    // TODO: How to handle ties? Right now it will go to last bid
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
                    } else if (bid2.price <= bids[j].price) {
                        // this catches the case in which the first bid in array
                        // is the highest, so bid2 never gets set, or last bid is highest,
                        // so second bid is not actually the second price
                        bid2 = bids[j];
                    }
                }
            }
        }
    }
    //finally, once top two bids are known, set clear price
    if (bid2) {
        bid1.clearprice = (bid2.price + 0.01).toFixed(2);
    } else {
        bid1.clearprice = bid1.price;
    }
    callback(null,bid1);
}

function send_win_notice(bid_object, callback){

}