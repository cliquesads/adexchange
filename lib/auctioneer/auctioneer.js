var request = require('request');
var _ = require('lodash');
var async = require('async');
var uuid = require('uuid');
var maxmind = require('maxmind');
var path = require('path');
var config = require('config');
var v6 = require('ipv6').v6;
var util = require('util');

// Initialize maxmind module with binary data file
var lookup = maxmind.openSync(
    path.join(process.env['HOME'],'/data/maxmind/GeoIP2-City.mmdb'),
    {
        cache: {
            max: 1000, // max items in cache
            maxAge: 1000 * 60 * 60 // life time in milliseconds
        }
    }
); // cache DB binary in memory, speeds up performance a lot

var CLIQUESBOT_UA_STRING = config.get('Screenshots.userAgent');
var PRICING = config.get('Pricing');

// This is super annoying but OpenRTB 2.3 requires ISO-3166-3 formatted country codes (3-letter), while
// MaxMind stores them as ISO-3166-2 (2-letter).  So I found this mapping to convert 2-letter to 3-letter
var COUNTRYCODE_MAPPING = {"BD":"BGD","BE":"BEL","BF":"BFA","BG":"BGR","BA":"BIH","BB":"BRB","WF":"WLF","BM":"BMU","BN":"BRN","BO":"BOL","BH":"BHR","BI":"BDI","BJ":"BEN","BT":"BTN","JM":"JAM","BV":"BVT","BW":"BWA","WS":"WSM","BR":"BRA","BS":"BHS","JE":"JEY","BY":"BLR","BZ":"BLZ","RU":"RUS","RW":"RWA","RS":"SRB","TL":"TLS","RE":"REU","TM":"TKM","TJ":"TJK","RO":"ROU","TK":"TKL","GW":"GNB","GU":"GUM","GT":"GTM","GS":"SGS","GR":"GRC","GQ":"GNQ","GP":"GLP","JP":"JPN","GY":"GUY","GG":"GGY","GF":"GUF","GE":"GEO","GD":"GRD","GB":"GBR","GA":"GAB","GN":"GIN","GM":"GMB","GL":"GRL","GI":"GIB","GH":"GHA","OM":"OMN","TN":"TUN","JO":"JOR","TA":"TAA","HR":"HRV","HT":"HTI","HU":"HUN","HK":"HKG","HN":"HND","HM":"HMD","VE":"VEN","PR":"PRI","PW":"PLW","PT":"PRT","KN":"KNA","PY":"PRY","AI":"AIA","PA":"PAN","PF":"PYF","PG":"PNG","PE":"PER","PK":"PAK","PH":"PHL","PN":"PCN","PL":"POL","PM":"SPM","ZM":"ZMB","EE":"EST","EG":"EGY","ZA":"ZAF","EC":"ECU","IT":"ITA","VN":"VNM","SB":"SLB","ET":"ETH","SO":"SOM","ZW":"ZWE","KY":"CYM","ES":"ESP","ER":"ERI","ME":"MNE","MD":"MDA","MG":"MDG","MA":"MAR","MC":"MCO","UZ":"UZB","MM":"MMR","ML":"MLI","MO":"MAC","MN":"MNG","MH":"MHL","MK":"MKD","MU":"MUS","MT":"MLT","MW":"MWI","MV":"MDV","MQ":"MTQ","MP":"MNP","MS":"MSR","MR":"MRT","IM":"IMN","UG":"UGA","MY":"MYS","MX":"MEX","IL":"ISR","FR":"FRA","AW":"ABW","SH":"SHN","AX":"ALA","SJ":"SJM","FI":"FIN","FJ":"FJI","FK":"FLK","FM":"FSM","FO":"FRO","NI":"NIC","NL":"NLD","NO":"NOR","NA":"NAM","VU":"VUT","NC":"NCL","NE":"NER","NF":"NFK","NG":"NGA","NZ":"NZL","NP":"NPL","NR":"NRU","NU":"NIU","CK":"COK","CI":"CIV","CH":"CHE","CO":"COL","CN":"CHN","CM":"CMR","CL":"CHL","CC":"CCK","CA":"CAN","CG":"COG","CF":"CAF","CD":"COD","CZ":"CZE","CY":"CYP","CX":"CXR","CR":"CRI","CV":"CPV","CU":"CUB","SZ":"SWZ","SY":"SYR","KG":"KGZ","KE":"KEN","SR":"SUR","KI":"KIR","KH":"KHM","SV":"SLV","KM":"COM","ST":"STP","SK":"SVK","KR":"KOR","SI":"SVN","KP":"PRK","KW":"KWT","SN":"SEN","SM":"SMR","SL":"SLE","SC":"SYC","KZ":"KAZ","SA":"SAU","SG":"SGP","SE":"SWE","SD":"SDN","DO":"DOM","DM":"DMA","DJ":"DJI","DK":"DNK","VG":"VGB","DE":"DEU","YE":"YEM","DZ":"DZA","US":"USA","UY":"URY","YT":"MYT","UM":"UMI","LB":"LBN","LC":"LCA","LA":"LAO","TV":"TUV","TW":"TWN","TT":"TTO","TR":"TUR","LK":"LKA","LI":"LIE","LV":"LVA","TO":"TON","LT":"LTU","LU":"LUX","LR":"LBR","LS":"LSO","TH":"THA","TF":"ATF","TG":"TGO","TD":"TCD","TC":"TCA","LY":"LBY","VA":"VAT","AC":"ASC","VC":"VCT","AE":"ARE","AD":"AND","AG":"ATG","AF":"AFG","IQ":"IRQ","VI":"VIR","IS":"ISL","IR":"IRN","AM":"ARM","AL":"ALB","AO":"AGO","AN":"ANT","AQ":"ATA","AS":"ASM","AR":"ARG","AU":"AUS","AT":"AUT","IO":"IOT","IN":"IND","TZ":"TZA","AZ":"AZE","IE":"IRL","ID":"IDN","UA":"UKR","QA":"QAT","MZ":"MOZ"};

/**
 *  Runs a single RTB second-price (aka Vickrey) auction synchronously
 *
 *  Bids are an array of flattened OpenRTB bid objects
 *
 *  Algorithm here is to loop over all bids only once for speed, and
 *  continually store two highest bids.  If next bid > bid1, then bid2 becomes
 *  bid1, and bid1 becomes the current bid.  I think this is a pretty efficient
 *  way to do this but could be wrong
 *
 *  @param {Array} bids array of flattened OpenRTB [version] compatible bid response objects
 *  @param {Function} callback callback function, expects (err, winning_bid)
 *  @returns winning bid response object
 *  */
var runSecondPriceAuction = exports.runSecondPriceAuction = function(bids, callback){

    //initialize with negative price to ensure nothing will ever beat it
    var bid1 = {"price": -100, "fake": true};
    var bid2 = {"price": -100, "fake": true}; //don't need to initialize with price, will immediately
    // become bid1 if bid_objects.length>1

    try {
        for (var i = 0; i < bids.length; i++) {
            // TODO: How to handle ties? Right now it will go to last bid
            if (bid1.price <= bids[i].price) {
                bid2 = bid1; // bump bid1 to bid2
                bid1 = bids[i];
            } else if (bid2.price <= bids[i].price) {
                // this catches the case in which the first bid in array
                // is the highest, so bid2 never gets set, or last bid is highest,
                // so second bid is not actually the second price
                bid2 = bids[i];
            }
        }
        //finally, once top two bids are known, set clear price
        if (!bid2.hasOwnProperty("fake")) {
            bid1.clearprice = (bid2.price + 0.01).toFixed(4);
        } else {
            bid1.clearprice = bid1.price;
        }
        return callback(null, bid1);
    } catch (e) {
        console.error("ERROR WHEN RUNNING SECOND PRICE AUCTION: " + e);
        return callback(e);
    }
};

/**
 * Flattens array of hierarchical OpenRTB-structured bid response objects
 * into array of single bid objects, with all parent metadata attached.
 *
 * Additionally, will filter our any empty bids returned, which indicates a bidder
 * provided a 204 "NOBID" response.
 *
 * @param {Array} openRTBBidObjects array of OpenRTB compliant bid response objects
 * @private
 */
var flattenBidObjects = exports.flattenBidObjects = function(openRTBBidObjects){
    var flattened_bids = {};
    if (openRTBBidObjects.length > 0) {
        for (var i = 0; i < openRTBBidObjects.length; i++) {
            var bid_obj = openRTBBidObjects[i];
            // filter out empty NODBID responses here
            if (bid_obj) {
                var seatbids = bid_obj.seatbid;
                for (var k = 0; k < seatbids.length; k++) {
                    var seatbid = seatbids[k];
                    var bids = seatbid.bid;
                    for (var j = 0; j < bids.length; j++) {
                        //augment with seatbid parent object values for logging/storage
                        //naming convention is to prefix key with [parent-level]__ if from
                        //parent object to avoid key collision
                        //TODO: Validate OpenRTB Specs of bid response
                        bids[j].seatbid__seat     = seatbid.seat;
                        bids[j].seatbid__group    = seatbid.group;
                        bids[j].seatbid__ext      = seatbid.ext;
                        //augment with bid response parent object values for logging/storage
                        bids[j].bidobj__id        = bid_obj.id;
                        bids[j].bidobj__bidid     = bid_obj.bidid;
                        bids[j].bidobj__cur       = bid_obj.cur;
                        bids[j].bidobj__customdata= bid_obj.customdata;
                        bids[j].bidobj__nbr       = bid_obj.nbr;
                        bids[j].bidobj__ext       = bid_obj.ext;
                        bids[j].nurl              = bid_obj.nurl;
                        var impid = bids[j].impid;
                        if (!flattened_bids[impid]){
                            flattened_bids[impid] = [];
                        }
                        flattened_bids[impid].push(bids[j]);
                    }
                }
            }
        }
    }
    return flattened_bids;
};

/**
 * Class to handle all RTB-auction-related tasks, which include:
 *
 * 1. Parsing incoming request (_parse_* functions)
 * 2. Generating bid request (_create_bid_request)
 * 3. Sending bid request to bidders (getBids)
 * 4. Receiving bid responses (getBids)
 * 5. Running auction & returning markup (_runAuction)
 * 6. Sending win notice (send_win_notice).
 *
 * Whole sequence can be conveniently executed through Auctioneer.main method
 *
 * bidders bidder object must have "url","nurl" and "timeout" properties
 *
 * @class Auctioneer
 * @param {Array} bidders array of bidder objects which contain "url" & "nurl" keys & values
 * @param {Number} bidder_timeout timeout in milliseconds for bidders
 * @param logger logger instance which inherits from winston.logger
 * @constructor
 */
var Auctioneer = function(bidders, bidder_timeout, logger){

    var DEFAULT_HEADERS = {
        "Content-Type": "application/json",
        "x-openrtb-version": config.get('Exchange.openrtb.version')
    };
    // TODO: Really should rename this property to "Cliques" or something else instead
    this.bidders = bidders;
    this.logger = logger;
    this.http_headers = DEFAULT_HEADERS;
    this.bidder_timeout = bidder_timeout;
};
exports.Auctioneer = Auctioneer;

/*  ============= BEGIN REQUEST PARSERS =========== */
/**
 *  The following functions process incoming request and parse out parameters
 *  to provide in bid request. Convention is to use ONE FUNCTION PER
 *  SECOND-LEVEL OPENRTB RESPONSE OBJECT unless otherwise noted.
 *
 *  @param {express.Request} req request object
 *  @param {Function} callback takes `(err, bid_data)`
 */

Auctioneer.prototype._parse_bid_data = function(req, callback){
    var bid_data = {
        "id": uuid.v1(),
        "at": 2, // 1 = first price auction, 2 = second price auction
        "cur": [ "USD" ] // Array of allowed currencies for bids on this bid request using ISO-4217 alpha codes
    };
    callback(null, bid_data);
};

Auctioneer.prototype._parse_bid_meta = function(req, callback) {
    var bid_meta = {
        "meta": {
            "pricing": PRICING
        }
    };
    callback(null, bid_meta);
};

/**
 * Both imp and site data are dependent on call to DB to get publisher
 * data, so both parsers are wrapped in this function to ensure one DB call
 * is made
 *
 * @param placement placement object from DB
 * @param req incoming express request object
 * @param pubURL Publisher URL object
 * @param callback callback func
 * @privates
 */
Auctioneer.prototype._parse_imp_and_site_data = function(placement, req, pubURL, callback){
    // get keywords from page object
    var concatenatedKeywords;
    if (!placement.parent_page.keywords) {
        concatenatedKeywords = [].join();
    } else {
        if (placement.parent_page.keywords.constructor === Array) {
            concatenatedKeywords = placement.parent_page.keywords.join();
        } else {
            concatenatedKeywords = placement.parent_page.keywords;
        }
    }

    // add any keywords passed as queryparam to URL
    // right now these simply get appended to existing keywords from parent page,
    // but should probably get checked for duplicates.
    if (pubURL.keywords){
        if (concatenatedKeywords){
            concatenatedKeywords = [concatenatedKeywords, pubURL.keywords].join(',');
        } else {
            concatenatedKeywords = pubURL.keywords;
        }
    }

    var site_data = {
        id: placement.parent_site.id,
        domain: placement.parent_site.domain_name,
        name: placement.parent_site.name,
        page: placement.parent_page.url,
        pagecat: [placement.parent_page.clique._id], //supposed to be IAB Category per OpenRTB but IDGAF
        publisher: {
            id: placement.parent_publisher.id,
            name: placement.parent_publisher.name,
            domain: placement.parent_publisher.website
        },
        keywords: concatenatedKeywords
    };
    var ref = req.headers['referer'];
    if (ref){ site_data.ref = ref }

    var imp = {
        tagid: placement.id,
        bidfloor: placement.parent_site.bidfloor || 0,
        secure: + (req.protocol === 'https'),
        banner: {h: placement.h,w: placement.w,pos: placement.pos},
        ext: {
            // TODO: This really belongs in site, but right now there's a bug in RTBKit core
            // TODO: that prevents it from passing site properly in bidrequest to agent
            branch: [placement.parent_site.clique._id, placement.parent_site.id, placement.parent_page.id, placement.id],

            // TODO: SmarterTravel-specific feature, need to figure out way to get it out of core codebase like how it's
            // TODO: done in js-dist
            location: pubURL.locationId
        }
    };
    //randomly generate impid based on timestamp
    var imps = [];

    // If placement is multiPaneNative, pass as multiple impressions in bid request.
    if (placement.type === 'multiPaneNative'){
        // get count for specific form factor from requesting client (either mobile or desktop)
        for (var i=0; i < placement.multiPaneNative.count[pubURL['form-factor']]; i++){
            imps[i] = _.clone(imp);
            imps[i].id = +process.hrtime().join('');
        }
        // Otherwise, just make single impression.
    } else {
        imps[0] = imp;
        imps[0].id = +process.hrtime().join('');
    }

    // Now augment with blacklist
    var badv = placement.parent_site.blacklist;

    callback(null, {imp: imps, site: site_data, badv: badv});
};

/**
 * Parses device & system data based on UA string.
 *
 * @param {express.Request} req incoming express request object
 * @param {Function} callback callback func takes `(err, device_data)`
 * @private
 */
Auctioneer.prototype._parse_device_data = function(req, callback){

    var device_data = {
        "ua": req.headers["user-agent"],
        "ip": req.clientIp
    };
    callback(null, device_data);
};

/**
 * Parses geo-data based on IP address.
 * Currently uses MaxMind for Geo-IP lookup.
 *
 * @param {express.Request} req incoming express request object
 * @param {Function} callback callback func
 * @private
 */
Auctioneer.prototype._parse_geo_data = function(req, callback){
    /*  */
    var ip = req.clientIp;
    var record = lookup.get(ip);
    if (record) {
        var geo = {
            // OpenRTB 2.3 s5.16: 1 = GPS/Location Services, 2 = IP Address, 3 = User provided
            "type": 2
        };
        if (record.location){
            if (record.location.latitude)  geo["lat"] = record.location.latitude;
            if (record.location.longitude) geo["lon"] = record.location.longitude;
            if (record.country) geo["country"] = COUNTRYCODE_MAPPING[record.country.iso_code];
            if (record.subdivisions) geo["region"] = record.subdivisions[0].iso_code;
            if (record.city) geo["city"] = record.city.names.en;
            if (record.postal) geo["zip"] = record.postal.code;
            if (record.location.metro_code) geo["metro"] = record.location.metro_code.toString();
        }
        callback(null, geo);
    } else {
        callback(null, {});
    }
};

/**
 * Parses geo-data based on IP address.  Currently uses MaxMind for
 * Geo-IP lookup.
 *
 * @param {express.Request} req incoming express request object
 * @param {Function} callback callback func
 * @private
 */
Auctioneer.prototype._parse_user_data = function(req, callback){
    var user_data = {"id": req.uuid };
    callback(null, user_data);
};

/*  ============= END REQUEST PARSERS ===========   */

/**
 * Main function to create single bid request.
 * Runs all parsing functions in parallel.
 *
 * @param {Placement} placement placement object from DB
 * @param {express.Request} req request object
 * @param pubURL Publisher URL object
 * @param {Function} cb callback function
 * @private
 */
Auctioneer.prototype._create_bid_request = function(placement, req, pubURL, cb){
    //run parsing functions in parallel
    var request_data = {};
    var auctioneer = this;
    async.parallel(
        [
            function (callback) {
                auctioneer._parse_bid_data(req, function (err, bid_data) {
                    if (err) return callback(err);
                    request_data.id = bid_data.id;
                    request_data.cur = bid_data.cur;
                    request_data.at = bid_data.at;
                    callback();
                });
            },
            function (callback) {
                auctioneer._parse_device_data(req, function (err, device_data) {
                    if (err) return callback(err);
                    request_data.device = device_data;
                    callback();
                });
            },
            function (callback) {
                auctioneer._parse_geo_data(req, function (err, geo_data) {
                    if (err) return callback(err);
                    request_data.geo = geo_data;
                    callback();
                });
            },
            function (callback) {
                auctioneer._parse_user_data(req, function (err, user_data) {
                    if (err) return callback(err);
                    request_data.user = user_data;
                    callback();
                });
            },
            function (callback) {
                auctioneer._parse_imp_and_site_data(placement, req, pubURL, function(err, imp_and_site_data){
                    if (err) return callback(err);
                    request_data.imp = imp_and_site_data.imp;
                    request_data.site = imp_and_site_data.site;
                    request_data.badv = imp_and_site_data.badv;
                    callback();
                });
            },
            function (callback) {
                auctioneer._parse_bid_meta(req, function (err, bid_meta) {
                    if (err) return callback(err);
                    request_data.meta = bid_meta.meta;
                    callback();
                }) 
            }
        ],
        function (err, results) {
            // Have to nest geo object underneath device to be OpenRTB 2.3 compliant
            if (err) return cb(err);
            request_data.device.geo = request_data.geo;
            request_data.tmax = auctioneer.bidder_timeout;
            delete request_data.geo;
            cb(null, request_data);
        }
    );
};

/* ====================== BEGIN PUBLIC METHODS ======================== */
//These methods handle the heavy lifting of shooting out bid requests,
//running the auction, and sending win notices.


/**
 * Hook for subclasses to implement custom bidder-lookup logic.
 *
 * Returned array of bidders will be called for all bid requests.
 *
 * Bidder objects contain two keys, "url" and "nurl", pointing to URLs for bids & win
 * notices respectively.
 *
 * This method must return an array of bidder objects, e.g.
 * [{
 *     url: "http://123.456.7.8:489/bid,
 *     nurl: "http://123.456.7.8:440
 *  },
 *  {
 *     url: "http://12.456.7.8:489/bid,
 *     nurl: "http://13.456.7.8:440
 *  }]
 *
 * Base class version just simply returns this.bidders array.
 *
 * @param {Placement} placement Placement object
 */
Auctioneer.prototype.getBidders = function(placement){
    var eligibleCliques = this.bidders.filter(function(clique){
        return clique.bidder.url;
    });
    return eligibleCliques.map(function(clique){
        return { url: clique.bidder.url, nurl: clique.bidder.nurl };
    });
};

var getInactiveError = module.exports.getInactiveError = function(placement){
    return 'Placement ' + placement._id + ' is inactive, auction was not run';
};

/**
 * Creates & sends bid request to all bidders in parallel & receives responses.
 *
 * Requests are sent via POST, call back is called once all bidders have responded.
 *
 * @param {Placement} placement placement object from DB
 * @param {express.Request} req incoming request object
 * @param {AdServerURL} pubURL parsed PubURL object
 * @param {Function} cb callback function, expects `(err, bids, bid_request)`
 */
Auctioneer.prototype.getBids = function(placement, req, pubURL, cb){
    // Gets all bid responses in parallel using async.parallel
    var bids = [];
    var a_tasks = [];
    var auctioneer = this;

    this._create_bid_request(placement, req, pubURL, function(err, request_data) {

        //create SINGLE bid request, then push functions to request bids
        //from individual bidders to async_tasks to execute in parallel
        if (err) {
            return cb(err);
        }
        //Catch if placement is inactive, don't send bid requests if it isnt.
        if (!placement.activeForFormFactor(pubURL["form-factor"])){
            var e = getInactiveError(placement);
            return cb(e, null, request_data);
        } else {
            auctioneer.getBidders(placement).forEach(function(item){
                a_tasks.push(function (callback) {
                    var post_options = {
                        headers: auctioneer.http_headers,
                        url: item.url,
                        body: request_data,
                        json: true,
                        timeout: auctioneer.bidder_timeout
                        //pool: {maxSockets: Infinity}
                    };
                    request.post(post_options, function (error, response, body) {
                        auctioneer.logger.bidResponse(error, item.url, request_data.id, response, body);
                        if (!error && response.statusCode == 200){
                            // not required to pass nurl (win url) through
                            // on bid request, can be pre-configured, but must be
                            // one of the two.  Here, will get nurl from config bidder
                            // object if it is not present on the bid request
                            if (!body.hasOwnProperty("nurl")){
                                body.nurl = item.nurl
                            }
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
                cb(null, bids, request_data);
            });
        }
    });
};

/**
 * Sends win_notice get request to bidder server at specified return url
 * Uses URL specified in bid_response as "nurl". expands any macro values
 * to pass back pertinent bid data.
 *
 * @param {Object} bid1 winning bid object
 * @param {String} uuid uuid for incoming user. NOTE: Added only b/c RTBKit expects userID on win-notice.
 * @param {Function} callback callback function
 */
Auctioneer.prototype.send_win_notice = function(bid1, uuid, callback){
    var nurl = bid1.nurl;
    var req_body = {
        timestamp: new Date() / 1000,
        bidRequestId: bid1.bidobj__id,
        impid: bid1.impid,
        price: Number(bid1.clearprice),
        userids: [uuid]
    };
    var request_options = {
        "url": nurl,
        "headers": this.http_headers,
        "body": req_body,
        "json": true
    };
    request.post(request_options,function(error, response, body){
        callback(error,nurl,response, body);
    });
};


var NO_BIDS_ERROR = 'No bids received for auction';

/**
 * Runs the RTB auction.
 *
 * Override this method to implement whatever bidding structure you like.
 *
 * Default behavior is to run simple second price auction with bids provided.
 *
 * @param placement
 * @param bid_objects Array as produced by flattenBidObjects function
 * @param callback
 */
Auctioneer.prototype.runAuction = function(placement, bid_objects, callback){
    if (bid_objects.length === 0){
        return callback(NO_BIDS_ERROR);
    } else {
        return runSecondPriceAuction(bid_objects, callback);
    }
};

/**
 *
 * Executes all steps, beginning with parsing incoming request & ending with sending win notice.
 *
 * @param {Placement} placement data object from Mongo containing publisher data
 * @param {express.Request} request request object
 * @param {express.Response} response response object
 * @param {AdServerURL} pubURL Parsed pubURL object
 * @param {Function} callback callback function to return impression response. Will actually get invoked as many times
 *  as there are impressions in the initial bid request.
 */
Auctioneer.prototype.main = function(placement, request, response, pubURL, callback){
    var auctioneer = this;
    var logger = this.logger;
    //first get all bids from bidders
    auctioneer.getBids(placement, request, pubURL, function (e, result, bid_request) {
        if (e) return callback(e, null, bid_request);
        if (result.length === 0) return callback(NO_BIDS_ERROR, null, bid_request);
        // run auction for each impression in request.
        // First need to "flatten" the bids received into arrays keyed by impression ID's
        var flattened_bids = flattenBidObjects(result);
        // return error if not all impressions sold through
        var incompleteBidsetErr = 'Did not receive bids for all impressions in auction, will serve default condition';
        if (Object.keys(flattened_bids).length < bid_request.imp.length) return callback(incompleteBidsetErr, null, bid_request);
        var auctions = {};
        // scaffolding of function to be added to parallel runAuction functions array
        var f = function(bids){
            return function(callerbacker){
                auctioneer.runAuction(placement, bids, function (er, winning_bid) {
                    if (er) return callerbacker(er);
                    //if successful, send winning markup in response to pub placement
                    callerbacker(null, winning_bid);
                });
            }
        };
        for (var impid in flattened_bids){
            if (flattened_bids.hasOwnProperty(impid)){
                // push individual runAuction functions to functions array
                // that will be run w/ async
                auctions[impid] = f(flattened_bids[impid])
            }
        }
        async.parallel(auctions, function(err, winning_bids){
            if (err) {
                callback(err, null, bid_request);
            } else {
                callback(null, winning_bids, bid_request);
                // now send win notices to bidder & log win notice
                // TODO: Sort of a hack now -- only send win notices for non-CliquesBot auctions
                if (request.headers['user-agent'] != CLIQUESBOT_UA_STRING) {
                    for (var impid in winning_bids) {
                        if (winning_bids.hasOwnProperty(impid)) {
                            var winning_bid = winning_bids[impid];
                            auctioneer.send_win_notice(winning_bid, request.uuid, function (err, nurl, win_notice_response, body) {
                                logger.winNotice(err, win_notice_response, body, nurl);
                            });
                        }
                    }
                }
            }
        });
    });
};
