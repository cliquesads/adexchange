var logging = require('cliques_node_utils.logging');

/**
 * Exchange-specific CLogger subclass...which itself is a subclass of winston.logger
 *
 * @param options winston logger options object
 * @constructor
 */
var ExchangeCLogger = function(options){
    logging.CLogger.call(options);
    this.options = options;
};

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
        statusCode: win_notice_response.statusCode
    };
    if (err){
        // log server error
        var errormsg = "WIN-NOTICE ERROR sending win notice";
        return logger.error(errormsg, win_notice_meta)
    }
    if (win_notice_response.statusCode != 200){
        // handle HTTP errors in sending win notice
        if (body.constructor === {}.constructor){
            body = JSON.stringify(body)
        }
        errormsg = 'HTTP Error on win notice, Status Code '
            + win_notice_response.statusCode + ': ' + body;
        logger.error(errormsg, win_notice_meta);
    } else {
        // handle success
        logger.info("WIN-NOTICE", win_notice_meta);
    }
};

/**
 * Logs impression event.  Does not handle
 *
 * @param err
 * @param request request object to which impression was delivered
 * @param response response object of impression
 * @param winning_bid winning bid object
 */
ExchangeCLogger.prototype.impression = function(err, request, response, winning_bid){
    var impression_meta = {
        type: "IMPRESSION",
        uuid: request.uuid
    };
    if (err){
        if (err.constructor === {}.constructor){
            err = JSON.stringify(err)
        }
        logger.error("IMPRESSION - ERROR raised during auction: " + err, impression_meta)
    }
    else if (winning_bid){
        var new_meta = {
            bidobj__id: winning_bid.bidobj__id,
            bidobj__bidid: winning_bid.bidobj__bidid,
            bidid: winning_bid.id,
            impid: winning_bid.impid,
            adid: winning_bid.adid,
            bid1: winning_bid.price,
            clearprice: winning_bid.clearprice
        };
        // merge new_meta keys in with base obj
        for (var k in new_meta){
            if (new_meta.hasOwnProperty(k)) {
                impression_meta[k] = new_meta[k];
            }
        }
        logger.info("IMPRESSION", impression_meta);
    }
};
