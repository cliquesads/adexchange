var fs = require('fs');
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

function _get_single_imp_fake_bid_request(callback){
    var request_data;
    fs.readFile('openrtb_bid_request_template.json','utf8',function(err, data) {
        if (err) {
            callback(err);
        }
        request_data = JSON.parse(data);
        //generate values for request data
        request_data.id = uuid.v1();
        request_data.imp[0].id = + process.hrtime().join(''); //concatenation of seconds & nanoseconds of HRtime
        callback(null, request_data);
    });
}

function get_bids(bid_urls, cb){
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
            _get_single_imp_fake_bid_request(function(err,request_data){
                if (err) throw err;
                post_options.form = request_data;
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