var cliques_node_utils = require('@cliques/cliques-node-utils');
var logging = cliques_node_utils.logging;
var util = require('util');

/**
 * Exchange-specific CLogger subclass...which itself is a subclass of winston.logger
 *
 * @param options winston logger options object
 * @constructor
 */
function ExchangeCLogger(options){
    logging.CLogger.call(this, options);
}
util.inherits(ExchangeCLogger, logging.CLogger);

/**
 * Logs Win Notice event.
 *
 * @param err any error in sending & receiving win notice
 * @param win_notice_response express response instance
 * @param body win-notice response body
 * @param {String} nurl URL to which win-notice was sent
 */
ExchangeCLogger.prototype.winNotice = function(err, win_notice_response, body, nurl){
    var win_notice_meta = {
        type: 'WIN-NOTICE',
        nurl: nurl,
        statusCode: win_notice_response ? win_notice_response.statusCode : null
    };
    if (err){
        // log server error
        var errormsg = "WIN-NOTICE ERROR sending win notice: " + err;
        return this.error(errormsg, win_notice_meta)
    }
    if (win_notice_response.statusCode != 200){
        // handle HTTP errors in sending win notice
        if (body.constructor === {}.constructor){
            body = JSON.stringify(body)
        }
        errormsg = 'HTTP Error on win notice, Status Code '
            + win_notice_response.statusCode + ': ' + body;
        this.error(errormsg, win_notice_meta);
    } else {
        // handle success
        this.info("WIN-NOTICE", win_notice_meta);
    }
};

/**
 * Logs impression event.
 *
 * @param err
 * @param placement Placement object from Mongo
 * @param request request object to which impression was delivered
 * @param response response object of impression
 * @param winning_bid winning bid object
 * @param bid_request openRTB bid request
 */
ExchangeCLogger.prototype.auction = function(err, placement, request, response, winning_bid, bid_request){
    bid_request.imp.forEach(function(imp){
        var auction_meta = {
            type: "AUCTION",
            uuid: request.uuid,
            auctionId: bid_request.id.toString(),
            impid: imp.id.toString(),
            placement: placement.id,
            page: placement.parent_page.id,
            site: placement.parent_site.id,
            publisher: placement.parent_publisher.id,
            pub_clique: placement.parent_site.clique.id,
            lat: bid_request.device.geo.lat || null,
            lon: bid_request.device.geo.lon || null,
            country: bid_request.device.geo.country || null,
            region: bid_request.device.geo.region || null,
            metro: bid_request.device.geo.metro || null,
            city: bid_request.device.geo.city || null,
            zip: bid_request.device.geo.zip || null
        };
        if (err){
            if (err.constructor === {}.constructor){
                err = JSON.stringify(err)
            }
            this.error("AUCTION ERROR raised during auction: " + err, auction_meta)
        }
        else if (winning_bid){
            var new_meta = {
                //auctionId: winning_bid.bidobj__id.toString(),
                bidobjid: winning_bid.bidobj__bidid ? winning_bid.bidobj__bidid.toString() : null,
                bidid: winning_bid.id.toString(),
                //impid: winning_bid.impid.toString(),
                adid: winning_bid.adid ? winning_bid.adid.toString() : null,
                bid1: winning_bid.price,
                clearprice: +winning_bid.clearprice
            };
            // merge new_meta keys in with base obj
            for (var k in new_meta){
                if (new_meta.hasOwnProperty(k)) {
                    auction_meta[k] = new_meta[k];
                }
            }
            this.info("AUCTION", auction_meta);
        }
    });
};

/**
 * Logs impression event.
 *
 * @param err
 * @param placement Placement object from Mongo
 * @param request request object to which impression was delivered
 * @param defaultType string representing defaultType selection for this placement
 * @param bid_request openRTB bid request
 */
ExchangeCLogger.prototype.auction_default = function(err, placement, defaultType, request, bid_request){
    var auction_default_meta = {
        type: "AUCTION-DEFAULT",
        uuid: request.uuid,
        auctionId: bid_request.id.toString(),
        defaultType: defaultType,
        placement: placement.id,
        page: placement.parent_page.id,
        site: placement.parent_site.id,
        publisher: placement.parent_publisher.id,
        pub_clique: placement.parent_site.clique.id
    };
    if (err){
        if (err.constructor === {}.constructor){
            err = JSON.stringify(err)
        }
        this.error("AUCTION DEFAULT ERROR:" + err, auction_default_meta)
    }
    else {
        this.info("AUCTION_DEFAULT", auction_default_meta);
    }
};

/**
 *  Log bid response & associated expected errors
 *
 * @param error
 * @param bidder_url
 * @param auctionId
 * @param response
 * @param body
 */
ExchangeCLogger.prototype.bidResponse = function(error, bidder_url, auctionId, response, body){
    if (body){
        if (body.constructor === {}.constructor){
            body = JSON.stringify(body);
        }
    }
    response = response || {};
    var meta = {
        type: "BID-RESPONSE",
        bidder_url: bidder_url,
        auctionId: auctionId,
        statusCode: response.statusCode,
        body: body
    };
    var format_error = function(err_msg, error_code){
        return util.format('BID-RESPONSE ERROR %s (error code %s)', err_msg, error_code);
    };
    if (error) {
        // First handle timeouts
        if (error.code == 'ETIMEDOUT' || error.code == 'ESOCKETTIMEDOUT') {
            this.error(format_error('Bidder timed out',error.code), meta)
        } else {
            //just log any other types of errors
            this.error(format_error('Unknown error',error.code), meta);
        }
    } else if (response.statusCode != 200 && response.statusCode != 204) {
        // catches any HTTP error (Non 200 or 204) thrown by bidder
        this.error(format_error('HTTP Error Occurred', response.statusCode), meta);
    } else if (response.statusCode == 204) {
        this.info('BID RESPONSE 204 Nobid received', meta);
    } else {
        this.info('BID RESPONSE 200 Bid received', meta)
    }
};

exports.ExchangeCLogger = ExchangeCLogger;