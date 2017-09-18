var _auctioneer = require('./lib/_auctioneer'),
    _Auctioneer = _auctioneer._Auctioneer,
    runSecondPriceAuction = _auctioneer.runSecondPriceAuction;
    flattenBidObjects = _auctioneer.flattenBidObjects;

/**
 * Auctioneer subclass which uses "bottom-up" bidding approach for bid resolution.
 *
 * @param bidders
 * @param bidder_timeout
 * @param logger
 * @constructor
 */
var Auctioneer = function(bidders, bidder_timeout, logger){
    Auctioneer.call(this, bidders, bidder_timeout, logger);
};
util.inherits(Auctioneer, Auctioneer);

/**
 * Custom bidder-lookup hook to get only bidders for cliques in subtree.
 *
 * @param placement
 */
Auctioneer.prototype.getBidders = function(placement){
    return this.bidders;
};

/**
 * Runs a bottom-up auction, i.e. second-price auction at each level of
 * a subtree starting at the placement level.
 *
 * @param placement
 * @param bid_objects
 * @param callback
 * @returns {*}
 */
Auctioneer.prototype.runAuction = function(placement, bid_objects, callback){

    // sub-function to handle recursion up the subtree
    function _doBottomUp(subtree, bids, callback){
        if (subtree.length === 0){
            var msg = 'ERROR: Reached top of the subtree and no compatible bids were found.';
            return callback(msg);
        }
        // stored in descending order, so have to work backwards
        var clique = subtree.pop();
        var bidsInClique = bids.filter(function(bid){
            return bid.seatbid__seat == clique
        });
        // if bids are found at this level, run the auction and return a winner
        if (bidsInClique.length > 0){
            runSecondPriceAuction(bidsInClique, function(err,winning_bid){
                if (err) return callback(err);
                return callback(null, winning_bid);
            });
        } else {
            _doBottomUp(subtree, bids, callback);
        }
    }

    var subtree = placement.parent_site.clique.ancestors;
    subtree.push(placement.parent_site.clique.id);
    var flattened_bids = flattenBidObjects(bid_objects);
    if (flattened_bids.length === 0){
        return callback('No bids received for auction');
    } else {
        return _doBottomUp(subtree, flattened_bids, callback);
    }
};

exports.Auctioneer = Auctioneer;
