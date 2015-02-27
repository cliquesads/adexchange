var request = require('request');
var async = require('async');
var uuid = require('node-uuid');
var maxmind = require('maxmind');
var path = require('path');
var url = require('url');
var config = require('config');
var util = require('util');

exports.get_bids = get_bids;
exports.run_auction = run_auction;
exports.send_win_notice = send_win_notice;
exports._create_single_imp_bid_request = _create_single_imp_bid_request;
exports.handle_default_condition = handle_default_condition;

// Initialize maxmind module with binary data file
maxmind.init(
    path.join(process.env['HOME'],'/data/maxmind/GeoIPCity.dat'), // No support for GeoIP2 mmdb format yet
    {memoryCache: true}); // cache DB binary in memory, speeds up performance a lot

// This is super annoying but OpenRTB 2.3 requires ISO-3166-3 formatted country codes (3-letter), while
// MaxMind stores them as ISO-3166-2 (2-letter).  So I found this mapping to convert 2-letter to 3-letter
var countrycode_mapping = {"BD":"BGD","BE":"BEL","BF":"BFA","BG":"BGR","BA":"BIH","BB":"BRB","WF":"WLF","BM":"BMU","BN":"BRN","BO":"BOL","BH":"BHR","BI":"BDI","BJ":"BEN","BT":"BTN","JM":"JAM","BV":"BVT","BW":"BWA","WS":"WSM","BR":"BRA","BS":"BHS","JE":"JEY","BY":"BLR","BZ":"BLZ","RU":"RUS","RW":"RWA","RS":"SRB","TL":"TLS","RE":"REU","TM":"TKM","TJ":"TJK","RO":"ROU","TK":"TKL","GW":"GNB","GU":"GUM","GT":"GTM","GS":"SGS","GR":"GRC","GQ":"GNQ","GP":"GLP","JP":"JPN","GY":"GUY","GG":"GGY","GF":"GUF","GE":"GEO","GD":"GRD","GB":"GBR","GA":"GAB","GN":"GIN","GM":"GMB","GL":"GRL","GI":"GIB","GH":"GHA","OM":"OMN","TN":"TUN","JO":"JOR","TA":"TAA","HR":"HRV","HT":"HTI","HU":"HUN","HK":"HKG","HN":"HND","HM":"HMD","VE":"VEN","PR":"PRI","PW":"PLW","PT":"PRT","KN":"KNA","PY":"PRY","AI":"AIA","PA":"PAN","PF":"PYF","PG":"PNG","PE":"PER","PK":"PAK","PH":"PHL","PN":"PCN","PL":"POL","PM":"SPM","ZM":"ZMB","EE":"EST","EG":"EGY","ZA":"ZAF","EC":"ECU","IT":"ITA","VN":"VNM","SB":"SLB","ET":"ETH","SO":"SOM","ZW":"ZWE","KY":"CYM","ES":"ESP","ER":"ERI","ME":"MNE","MD":"MDA","MG":"MDG","MA":"MAR","MC":"MCO","UZ":"UZB","MM":"MMR","ML":"MLI","MO":"MAC","MN":"MNG","MH":"MHL","MK":"MKD","MU":"MUS","MT":"MLT","MW":"MWI","MV":"MDV","MQ":"MTQ","MP":"MNP","MS":"MSR","MR":"MRT","IM":"IMN","UG":"UGA","MY":"MYS","MX":"MEX","IL":"ISR","FR":"FRA","AW":"ABW","SH":"SHN","AX":"ALA","SJ":"SJM","FI":"FIN","FJ":"FJI","FK":"FLK","FM":"FSM","FO":"FRO","NI":"NIC","NL":"NLD","NO":"NOR","NA":"NAM","VU":"VUT","NC":"NCL","NE":"NER","NF":"NFK","NG":"NGA","NZ":"NZL","NP":"NPL","NR":"NRU","NU":"NIU","CK":"COK","CI":"CIV","CH":"CHE","CO":"COL","CN":"CHN","CM":"CMR","CL":"CHL","CC":"CCK","CA":"CAN","CG":"COG","CF":"CAF","CD":"COD","CZ":"CZE","CY":"CYP","CX":"CXR","CR":"CRI","CV":"CPV","CU":"CUB","SZ":"SWZ","SY":"SYR","KG":"KGZ","KE":"KEN","SR":"SUR","KI":"KIR","KH":"KHM","SV":"SLV","KM":"COM","ST":"STP","SK":"SVK","KR":"KOR","SI":"SVN","KP":"PRK","KW":"KWT","SN":"SEN","SM":"SMR","SL":"SLE","SC":"SYC","KZ":"KAZ","SA":"SAU","SG":"SGP","SE":"SWE","SD":"SDN","DO":"DOM","DM":"DMA","DJ":"DJI","DK":"DNK","VG":"VGB","DE":"DEU","YE":"YEM","DZ":"DZA","US":"USA","UY":"URY","YT":"MYT","UM":"UMI","LB":"LBN","LC":"LCA","LA":"LAO","TV":"TUV","TW":"TWN","TT":"TTO","TR":"TUR","LK":"LKA","LI":"LIE","LV":"LVA","TO":"TON","LT":"LTU","LU":"LUX","LR":"LBR","LS":"LSO","TH":"THA","TF":"ATF","TG":"TGO","TD":"TCD","TC":"TCA","LY":"LBY","VA":"VAT","AC":"ASC","VC":"VCT","AE":"ARE","AD":"AND","AG":"ATG","AF":"AFG","IQ":"IRQ","VI":"VIR","IS":"ISL","IR":"IRN","AM":"ARM","AL":"ALB","AO":"AGO","AN":"ANT","AQ":"ATA","AS":"ASM","AR":"ARG","AU":"AUS","AT":"AUT","IO":"IOT","IN":"IND","TZ":"TZA","AZ":"AZE","IE":"IRL","ID":"IDN","UA":"UKR","QA":"QAT","MZ":"MOZ"};

var DEFAULT_HEADERS = {
    "x-openrtb-version": config.get('Exchange.openrtb.version'),
    "content-type": "application/json"
};

var bidder_timeout = config.get('Exchange.bidder.timeout');

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

function _parse_imp_data(req,callback){
    //TODO: add more stuff here
    var imp_data = [{
            "id": +process.hrtime().join(''), //randomly generate impid based on timestamp
            "bidfloor": 0.03,
            "banner": {
                "h": null, "w": null, "pos": null
            }
        }];
    imp_data[0].banner.h = req.query.h;
    imp_data[0].banner.w = req.query.w;
    imp_data[0].banner.pos = req.query.pos;
    callback(null,imp_data);
}

function _parse_device_data(req, callback){
    /* Parses user-agent string on incoming request into OpenRTB device object

    NOTE: This is pretty slow, actually blocks the event loop pretty substantially, mainly
    in regex processing.  Thinking about actually putting this on the bidding side instead,
    commenting out until further notice (2/26/15).
    */

    // UNCOMMENT THE FOLLOWING SECTION TO ENABLE UA PARSING, BUT IT
    // WILL CAUSE A SERIOUS PERFORMANCE HIT

    //var useragent = req.headers["user-agent"];
    //var parser = new UAParser;
    //var parsed_ua = parser.parse(useragent);
    //
    //// have to do some work to determine 'devicetype' according to
    //// enumerated list in OpenRTB 2.3 section 5.17.
    //var devicetype = null;
    //if (parsed_ua.device.family == 'Other') {
    //    devicetype = 'Personal Computer'
    //} else {
    //    // Only using this lib to parse mobile device types
    //    // NOTE: if this fails to detect devicetype, it goes through as null
    //    // I don't do anything to detect Connected TV or Connected Device
    //    // device types, and I don't really care enough to do anything about
    //    // it for the forseeable future.
    //    var md = new MobileDetect(useragent);
    //    if (md.phone()){
    //        devicetype = 'Phone';
    //    } else if (md.tablet()) {
    //        devicetype = 'Tablet';
    //    }
    //}

    var device_data = {
        "ua": req.headers["user-agent"],
        "ip": req.clientIp//,
        //"devicetype": devicetype,
        //"make": parsed_ua.brand,
        //"model": parsed_ua.model,
        //"os": parsed_ua.os.family,
        //// not worrying about minor version for now, but could
        //"osv": parsed_ua.os.major
    };
    callback(null, device_data);
}

function _parse_geo_data(req, callback){
    /* Parses geo-data based on IP address.  Currently uses MaxMind for
     Geo-IP lookup. */
    var location = maxmind.getLocation(req.clientIp);
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
            // the dmaCode lookup is currently broken in the maxmind API I'm using, will always
            // get set to 0. I've submitted an issue here:
            // https://github.com/runk/node-maxmind/issues/26
            "metro": location.metroCode
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

function _parse_site_data(req, callback){
    //TODO: Write this, parse incoming URL & taxonomy of publisher based
    //TODO: on some persistent datastore
    var site_data = {
        "id": "102855",
        "cat": [ "IAB3-1" ],
        "domain": null,
        "page": null,
        "publisher": {
            "id": "8953", "name": null,
            "cat": [ "IAB3-1" ],
            "domain": null
        }
    };
    var ref = req.headers['referer'];
    if (ref){
        var parsed = url.parse(ref);
        site_data.domain = parsed.host;
        site_data.publisher.name = parsed.hostname;
        site_data.publisher.domain = parsed.host;
    }
    callback(null, site_data);
}

/*  ============= END REQUEST PARSERS ===========   */

function _create_single_imp_bid_request(req, cb){
    // Main function to create single bid request.  Runs all parsing functions in parallel.

    //run parsing functions in parallel
    var request_data = {};
    try {
        async.parallel(
            [
                function (callback) {
                    _parse_bid_data(req, function (err, bid_data) {
                        if (err) throw err;
                        request_data.id = bid_data.id;
                        request_data.cur = bid_data.cur;
                        request_data.at = bid_data.at;
                        callback();
                    });
                },
                function (callback) {
                    _parse_device_data(req, function (err, device_data) {
                        if (err) throw err;
                        request_data.device = device_data;
                        callback();
                    });
                },
                function (callback) {
                    setTimeout(_parse_geo_data(req, function(err, geo_data) {
                       if (err) throw err;
                        request_data.geo = geo_data;
                        callback();
                    }),100);
                },
                function (callback) {
                    _parse_user_data(req, function (err, user_data) {
                        if (err) throw err;
                        request_data.user = user_data;
                        callback();
                    });
                },
                function (callback) {
                    _parse_site_data(req, function (err, site_data) {
                        if (err) throw err;
                        request_data.site = site_data;
                        callback();
                    });
                },
                function (callback) {
                    _parse_imp_data(req, function (err, imp_data) {
                        if (err) throw err;
                        request_data.imp = imp_data;
                        callback();
                    });
                }
            ],
            function () {
                // Have to nest geo object underneath device to be OpenRTB 2.3 compliant
                request_data.device.geo = request_data.geo;
                delete request_data.geo;
                cb(null, request_data);
            }
        );
    } catch (e) {
        cb(e);
    }
}

/*  BEGIN publicly exposed functions to handle the heavy lifting,
    i.e. shooting out bid requests, running the auction, and sending win notices. */

function get_bids(bid_urls, req, logger, cb){
    // Gets all bid responses in parallel using async.parallel
    var bids = [];
    var async_tasks = [];
    var bid_timeout =  bidder_timeout; // timeout bid request if no response within this # ms

    _create_single_imp_bid_request(req, function(err, request_data){

        //create SINGLE bid request, then push functions to request bids
        //from individual bidders to async_tasks to execute in parallel
        if (err) {
            cb(err);
        }
        bid_urls.forEach(function(item){
            async_tasks.push(function(callback){
                var post_options = {
                    headers: DEFAULT_HEADERS,
                    url: item,
                    form: request_data,
                    timeout: bid_timeout
                };
                request.post(post_options, function (error, response, body) {
                    // handle bid response here
                    // Errors handled first
                    if (error) {
                        // First handle timeouts
                        if (error.code == 'ETIMEDOUT' || error.code == 'ESOCKETTIMEDOUT') {
                            logger.error('Bidder Timeout for bidder at URL %s',item,request_data)
                        } else {
                            //just log any other types of errors
                            logger.error(error);
                        }
                    } else if (response.statusCode != 200 && response.statusCode != 204) {
                        // catches any HTTP error (Non 200 or 204) thrown by bidder
                        logger.error('HTTP Error Returned from bidder, Status Code ' + response.statusCode + ': ' + body);
                        return callback(err);
                    } else {
                        //finally, if everything looks good, push to bids
                        bids.push(JSON.parse(body));
                    }
                    callback(); // call async callback to let it know task is done
                });
            });
        });
    });
    try {
        async.parallel(async_tasks, function(){
            // function to call when done
            cb(null, bids);
        });
    } catch (e) {
        cb(e);
    }
}

function send_win_notice(bid1, callback){
    // Sends win_notice get request to bidder server at specified return url
    // Uses URL specified in bid_response as "nurl", expands any macro values
    // to pass back pertinent bid data

    var win_response_macro_values = {
        "${AUCTION_ID}": bid1.bidobj__id,
        "${AUCTION_BID_ID}": bid1.bidobj__bidid,
        "${AUCTION_IMP_ID}": bid1.impid,
        "${AUCTION_SEAT_ID}": bid1.seatbid__seat_id,
        "${AUCTION_AD_ID}": bid1.adid,
        "${AUCTION_PRICE}": bid1.clearprice,
        "${AUCTION_CURRENCY}": bid1.bidobj__cur
    };
    //TODO: decode until fully decoded
    var nurl = decodeURIComponent(bid1.nurl); //decode win response URL once
    for (var macro in win_response_macro_values){
        if (win_response_macro_values.hasOwnProperty(macro)) {
            nurl = nurl.replace(macro, win_response_macro_values[macro]);
        }
    }
    var request_options = {
        "url": nurl,
        "headers": DEFAULT_HEADERS,
        "method": "GET"
    };
    try {
        request(request_options,function(error, response, body){
            callback(error,nurl,response);
        });
    } catch (e) {
        callback(e);
    }
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
    var bid1 = {"price": -100};
    var bid2 = {"price": -100}; //don't need to initialize with price, will immediately
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
            if (bid2) {
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

function handle_default_condition(request, response){
    ///var dim = util.format('%sx%s',request.query.w,request.query.h);
    response.status(200).json({"adm": config.get('Exchange.defaultcondition.300x250', dim)});
}