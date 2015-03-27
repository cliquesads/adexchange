var db = require('./db');

var request = require('request');
var async = require('async');
var uuid = require('node-uuid');
var maxmind = require('maxmind');
var path = require('path');
var config = require('config');
var v6 = require('ipv6').v6;

exports.get_bids = get_bids;
exports.run_auction = run_auction;
exports.send_win_notice = send_win_notice;
exports._create_single_imp_bid_request = _create_single_imp_bid_request;

// Initialize maxmind module with binary data file
maxmind.init(
    path.join(process.env['HOME'],'/data/maxmind/GeoIPCity.dat'), // No support for GeoIP2 mmdb format yet
    {memoryCache: true}); // cache DB binary in memory, speeds up performance a lot

// This is super annoying but OpenRTB 2.3 requires ISO-3166-3 formatted country codes (3-letter), while
// MaxMind stores them as ISO-3166-2 (2-letter).  So I found this mapping to convert 2-letter to 3-letter
var countrycode_mapping = {"BD":"BGD","BE":"BEL","BF":"BFA","BG":"BGR","BA":"BIH","BB":"BRB","WF":"WLF","BM":"BMU","BN":"BRN","BO":"BOL","BH":"BHR","BI":"BDI","BJ":"BEN","BT":"BTN","JM":"JAM","BV":"BVT","BW":"BWA","WS":"WSM","BR":"BRA","BS":"BHS","JE":"JEY","BY":"BLR","BZ":"BLZ","RU":"RUS","RW":"RWA","RS":"SRB","TL":"TLS","RE":"REU","TM":"TKM","TJ":"TJK","RO":"ROU","TK":"TKL","GW":"GNB","GU":"GUM","GT":"GTM","GS":"SGS","GR":"GRC","GQ":"GNQ","GP":"GLP","JP":"JPN","GY":"GUY","GG":"GGY","GF":"GUF","GE":"GEO","GD":"GRD","GB":"GBR","GA":"GAB","GN":"GIN","GM":"GMB","GL":"GRL","GI":"GIB","GH":"GHA","OM":"OMN","TN":"TUN","JO":"JOR","TA":"TAA","HR":"HRV","HT":"HTI","HU":"HUN","HK":"HKG","HN":"HND","HM":"HMD","VE":"VEN","PR":"PRI","PW":"PLW","PT":"PRT","KN":"KNA","PY":"PRY","AI":"AIA","PA":"PAN","PF":"PYF","PG":"PNG","PE":"PER","PK":"PAK","PH":"PHL","PN":"PCN","PL":"POL","PM":"SPM","ZM":"ZMB","EE":"EST","EG":"EGY","ZA":"ZAF","EC":"ECU","IT":"ITA","VN":"VNM","SB":"SLB","ET":"ETH","SO":"SOM","ZW":"ZWE","KY":"CYM","ES":"ESP","ER":"ERI","ME":"MNE","MD":"MDA","MG":"MDG","MA":"MAR","MC":"MCO","UZ":"UZB","MM":"MMR","ML":"MLI","MO":"MAC","MN":"MNG","MH":"MHL","MK":"MKD","MU":"MUS","MT":"MLT","MW":"MWI","MV":"MDV","MQ":"MTQ","MP":"MNP","MS":"MSR","MR":"MRT","IM":"IMN","UG":"UGA","MY":"MYS","MX":"MEX","IL":"ISR","FR":"FRA","AW":"ABW","SH":"SHN","AX":"ALA","SJ":"SJM","FI":"FIN","FJ":"FJI","FK":"FLK","FM":"FSM","FO":"FRO","NI":"NIC","NL":"NLD","NO":"NOR","NA":"NAM","VU":"VUT","NC":"NCL","NE":"NER","NF":"NFK","NG":"NGA","NZ":"NZL","NP":"NPL","NR":"NRU","NU":"NIU","CK":"COK","CI":"CIV","CH":"CHE","CO":"COL","CN":"CHN","CM":"CMR","CL":"CHL","CC":"CCK","CA":"CAN","CG":"COG","CF":"CAF","CD":"COD","CZ":"CZE","CY":"CYP","CX":"CXR","CR":"CRI","CV":"CPV","CU":"CUB","SZ":"SWZ","SY":"SYR","KG":"KGZ","KE":"KEN","SR":"SUR","KI":"KIR","KH":"KHM","SV":"SLV","KM":"COM","ST":"STP","SK":"SVK","KR":"KOR","SI":"SVN","KP":"PRK","KW":"KWT","SN":"SEN","SM":"SMR","SL":"SLE","SC":"SYC","KZ":"KAZ","SA":"SAU","SG":"SGP","SE":"SWE","SD":"SDN","DO":"DOM","DM":"DMA","DJ":"DJI","DK":"DNK","VG":"VGB","DE":"DEU","YE":"YEM","DZ":"DZA","US":"USA","UY":"URY","YT":"MYT","UM":"UMI","LB":"LBN","LC":"LCA","LA":"LAO","TV":"TUV","TW":"TWN","TT":"TTO","TR":"TUR","LK":"LKA","LI":"LIE","LV":"LVA","TO":"TON","LT":"LTU","LU":"LUX","LR":"LBR","LS":"LSO","TH":"THA","TF":"ATF","TG":"TGO","TD":"TCD","TC":"TCA","LY":"LBY","VA":"VAT","AC":"ASC","VC":"VCT","AE":"ARE","AD":"AND","AG":"ATG","AF":"AFG","IQ":"IRQ","VI":"VIR","IS":"ISL","IR":"IRN","AM":"ARM","AL":"ALB","AO":"AGO","AN":"ANT","AQ":"ATA","AS":"ASM","AR":"ARG","AU":"AUS","AT":"AUT","IO":"IOT","IN":"IND","TZ":"TZA","AZ":"AZE","IE":"IRL","ID":"IDN","UA":"UKR","QA":"QAT","MZ":"MOZ"};

var DEFAULT_HEADERS = {
    "Content-Type": "application/json",
    "x-openrtb-version": config.get('Exchange.openrtb.version')
};

var bidder_timeout = config.get('Exchange.bidder.timeout');
var default_nurl = config.get('Exchange.bidder.nurl');

/*  The following functions process incoming request and parse out parameters
    to provide in bid request. Convention is to use ONE FUNCTION PER
    SECOND-LEVEL OPENRTB RESPONSE OBJECT unless otherwise noted. */

/*  ============= BEGIN REQUEST PARSERS =========== */

function _parse_bid_data(req,callback){
    var bid_data = {
        "id": uuid.v1(),
        "at": 2, // 1 = first price auction, 2 = second price auction
        "cur": [ "USD" ] // Array of allowed currencies for bids on this bid request using ISO-4217 alpha codes
    };
    callback(null, bid_data);
}

function _parse_imp_and_site_data(req, connection, callback){
    /* Both imp and site data are dependent on call to DB to get publisher
    data, so both parsers are wrapped in this function to ensure one DB call
    is made */

    //make DB call first, populate data in callback
    //var pub_data = {imp_data: {}, site_data: {}};
    db.getPublisherData(req, connection, function(err, pub_data) {
        if (err) return callback(err);

        // first parse imp data
        var imp_data = [pub_data.imp_data];
        //randomly generate impid based on timestamp
        imp_data[0].id = +process.hrtime().join('');
        imp_data[0].secure = + (request.protocol == 'https');

        // now parse site data
        var site_data = pub_data.site_data;
        var ref = req.headers['referer'];
        if (ref){ site_data.ref = ref }

        callback(null, {imp: imp_data, site: site_data});
    });
}

function _parse_device_data(req, callback){

    var device_data = {
        "ua": req.headers["user-agent"],
        "ip": req.clientIp
    };
    callback(null, device_data);
}

function _parse_geo_data(req, callback){
    /* Parses geo-data based on IP address.  Currently uses MaxMind for
     Geo-IP lookup. */
    var ip = req.clientIp;
    // new in Node 0.12.0 is default usage of IPv6 addresses
    var addr = new v6.Address(ip);
    var location = false;
    if (addr.v4) {
        //TODO: Don't know how sound this logic is for
        // converting to v4.  There is no native function in ipv6 to convert to ip
        location = maxmind.getLocation(ip.replace('::ffff:',''));
    }

    if (location) {
        var geo = {
            // OpenRTB 2.3 s5.16: 1 = GPS/Location Services, 2 = IP Address, 3 = User provided
            "type": 2,
            "lat": location.latitude,
            "lon": location.longitude,
            "country": countrycode_mapping[location.countryCode],
            "region": location.region,
            "city": location.city,
            "zip": location.postalCode,
            "metro": location.metroCode.toString()
        };
        callback(null, geo);
    } else {
        callback(null, {})
    }
}

function _parse_user_data(req, callback){
    var user_data = {"id": req.uuid };
    callback(null, user_data);
}

/*  ============= END REQUEST PARSERS ===========   */

function _create_single_imp_bid_request(req, connection, cb){
    // Main function to create single bid request.  Runs all parsing functions in parallel.

    //run parsing functions in parallel
    var request_data = {};
    async.parallel(
        [
            function (callback) {
                _parse_bid_data(req, function (err, bid_data) {
                    if (err) return callback(err);
                    request_data.id = bid_data.id;
                    request_data.cur = bid_data.cur;
                    request_data.at = bid_data.at;
                    callback();
                });
            },
            function (callback) {
                _parse_device_data(req, function (err, device_data) {
                    if (err) return callback(err);
                    request_data.device = device_data;
                    callback();
                });
            },
            function (callback) {
                if (process.env.NODE_ENV == "local-test"){
                    request_data.geo = {
                        "type": 2,
                        "lat": 42.3331,
                        "lon": -71.0957,
                        "country": "USA",
                        "region": "MA",
                        "city": "Boston",
                        "zip": "02120",
                        "metro": "506"
                    };
                    callback();
                } else {
                    _parse_geo_data(req, function (err, geo_data) {
                        if (err) return callback(err);
                        request_data.geo = geo_data;
                        callback();
                    })
                }
            },
            function (callback) {
                _parse_user_data(req, function (err, user_data) {
                    if (err) return callback(err);
                    request_data.user = user_data;
                    callback();
                });
            },
            function (callback) {
                _parse_imp_and_site_data(req, connection, function(err, imp_and_site_data){
                    if (err) return callback(err);
                    request_data.imp = imp_and_site_data.imp;
                    request_data.site = imp_and_site_data.site;
                    callback();
                });
            }
        ],
        function (err, results) {
            // Have to nest geo object underneath device to be OpenRTB 2.3 compliant
            if (err) return cb(err);
            request_data.device.geo = request_data.geo;
            request_data.tmax = bidder_timeout;
            delete request_data.geo;
            cb(null, request_data);
        }
    );
}

/*  BEGIN publicly exposed functions to handle the heavy lifting,
    i.e. shooting out bid requests, running the auction, and sending win notices. */

function get_bids(bid_urls, req, logger, connection, cb){
    // Gets all bid responses in parallel using async.parallel
    var bids = [];
    var a_tasks = [];
    var bid_timeout =  bidder_timeout; // timeout bid request if no response within this # ms

    _create_single_imp_bid_request(req, connection, function(err, request_data) {

        //create SINGLE bid request, then push functions to request bids
        //from individual bidders to async_tasks to execute in parallel
        if (err) {
            return cb(err);
        }
        //console.log(JSON.stringify(request_data.imp, null, 2));
        //console.log(JSON.stringify(request_data.site, null, 2));
        bid_urls.forEach(function (item) {
            a_tasks.push(function (callback) {
                var post_options = {
                    headers: DEFAULT_HEADERS,
                    url: item,
                    body: request_data,
                    json: true,
                    timeout: bid_timeout
                    //pool: {maxSockets: Infinity}
                };
                request.post(post_options, function (error, response, body) {
                    // handle bid response here
                    // Errors handled first
                    //logger.info("POST Request sent to " + item);
                    //logger.info("Response: " + JSON.stringify(body, null, 2));
                    if (error) {
                        // First handle timeouts
                        if (error.code == 'ETIMEDOUT' || error.code == 'ESOCKETTIMEDOUT') {
                            logger.error('Bidder Timeout for bidder at URL %s', item, request_data)
                        } else {
                            //just log any other types of errors
                            logger.error(error);
                        }
                    } else if (response.statusCode != 200 && response.statusCode != 204) {
                        // catches any HTTP error (Non 200 or 204) thrown by bidder
                        logger.error('HTTP Error Returned from bidder, Status Code ' + response.statusCode + ': ' + body);
                        if (body.constructor === {}.constructor){
                            logger.error(JSON.stringify(body, null, 2));
                        }
                        //return callback(err);
                    } else if (response.statusCode == 204) {
                        logger.info('HTTP 204 NOBID received');
                    } else {
                        //finally, if everything looks good, push to bids
                        bids.push(body);
                    }
                    callback(); // call async callback to let it know task is done
                });
            });
        });
        async.parallel(a_tasks, function (err, result) {
            // function to call when done
            if (err) return cb(err);
            cb(null, bids);
        });
    });
}

function send_win_notice(bid1, uuid, callback){
    // Sends win_notice get request to bidder server at specified return url
    // Uses URL specified in bid_response as "nurl", expands any macro values
    // to pass back pertinent bid data

    //var win_response_macro_values = {
    //    "${AUCTION_ID}": bid1.bidobj__id,
    //    "${AUCTION_BID_ID}": bid1.bidobj__bidid,
    //    "${AUCTION_IMP_ID}": bid1.impid,
    //    "${AUCTION_SEAT_ID}": bid1.seatbid__seat_id,
    //    "${AUCTION_AD_ID}": bid1.adid,
    //    "${AUCTION_PRICE}": bid1.clearprice,
    //    "${AUCTION_CURRENCY}": bid1.bidobj__cur
    //};

    //TODO: decode until fully decoded
    if (bid1.hasOwnProperty("nurl")){
        var nurl = decodeURIComponent(bid1.nurl); //decode win response URL once
        //for (var macro in win_response_macro_values){
        //    if (win_response_macro_values.hasOwnProperty(macro)) {
        //        nurl = nurl.replace(macro, win_response_macro_values[macro]);
        //    }
        //}
    } else {
        nurl = default_nurl;
    }
    var req_body = {
        timestamp: new Date() / 1000,
        bidRequestId: bid1.bidobj__id,
        impid: bid1.impid,
        price: bid1.clearprice,
        userids: [uuid]
    };
    var request_options = {
        "url": nurl,
        "headers": DEFAULT_HEADERS,
        "body": req_body,
        "json": true
    };

    request.post(request_options,function(error, response, body){
        callback(error,nurl,response, body);
    });
}

function run_auction(bid_objects, callback){
    /* Runs the RTB auction

    Synchronous as far as I can tell, not including callback
    arg bid_objects must be OpenRTB-compliant 2.3 bid-response object

    Works for arbitrary number of seatbids per bid object, and arbitrary number
    of bids per seatbid

    Algorithm here is to loop over all bids only once for speed, and
    continually store two highest bids.  If next bid > bid1, then bid2 becomes
    bid1, and bid1 becomes the current bid.  I think this is a pretty efficient
    way to do this but could be wrong. */

    //initialize with negative price to ensure nothing will ever beat it
    var bid1 = {"price": -100, "fake": true};
    var bid2 = {"price": -100, "fake": true}; //don't need to initialize with price, will immediately
    // become bid1 if bid_objects.length>1

    try {
        if (bid_objects.length > 0){
            for (var i = 0; i < bid_objects.length; i++) {
                var bid_obj = bid_objects[i];
                if (bid_obj) { //have to check if bid_object is empty, as {} indicates a no-bid
                    var seatbids = bid_obj.seatbid;
                    for (var k = 0; k < seatbids.length; k++) {
                        var seatbid = seatbids[k];
                        var bids = seatbid.bid;
                        for (var j = 0; j < bids.length; j++) {
                            // TODO: How to handle ties? Right now it will go to last bid
                            if (bid1.price <= bids[j].price) {
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
            if (!bid2.hasOwnProperty("fake")) {
                bid1.clearprice = (bid2.price + 0.01).toFixed(2);
            } else {
                bid1.clearprice = bid1.price;
            }
            callback(null, bid1);
        } else {
            callback("No bids received for auction")
        }
    } catch (e) {
        callback(e);
    }
}