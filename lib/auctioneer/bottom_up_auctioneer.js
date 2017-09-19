var util = require('util'),
    auctioneer = require('./auctioneer'),
    Auctioneer = auctioneer.Auctioneer,
    runSecondPriceAuction = auctioneer.runSecondPriceAuction,
    flattenBidObjects = auctioneer.flattenBidObjects;

/**
 * Auctioneer subclass which uses "bottom-up" bidding approach for bid resolution.
 *
 * @param bidders
 * @param bidder_timeout
 * @param logger
 * @constructor
 */
var BottomUpAuctioneer = function(bidders, bidder_timeout, logger){
    Auctioneer.call(this, bidders, bidder_timeout, logger);
};
util.inherits(BottomUpAuctioneer, Auctioneer);

/**
 * Custom bidder-lookup hook to get only bidders for cliques in subtree.
 *
 * @param placement
 */
BottomUpAuctioneer.prototype.getBidders = function(placement){
    var bidders = [];
    var eligible_bidders = placement.parent_site.clique.ancestors;
    eligible_bidders.push(placement.parent_site.clique.id);
    this.bidders.forEach(function(clique){
        if (eligible_bidders.indexOf(clique.id) > -1){
            if (clique.bidder){
                bidders.push({ url: clique.bidder.url, nurl: clique.bidder.nurl });
            }
        }
    });
    return bidders;
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
BottomUpAuctioneer.prototype.runAuction = function(placement, bid_objects, callback){

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

exports.BottomUpAuctioneer = BottomUpAuctioneer;
