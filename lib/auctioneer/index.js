var bottomUpAuctioneer = require('./bottom_up_auctioneer');
var auctioneer = require('./auctioneer');

// Each auctionType corresponds to one specific Auctioneer subclass, so anytime a new
// Auctioneer subclass is created, this map must be updated.
var AUCTION_TYPE_MAP = {
    "flat": auctioneer.Auctioneer,
    "bottomUp": bottomUpAuctioneer.BottomUpAuctioneer
};

module.exports = function(auctionType){
    auctionType = auctionType || "flat";
    return {
        "Auctioneer": AUCTION_TYPE_MAP[auctionType],
        "flattenBidObjects": auctioneer.flattenBidObjects,
        "runSecondPriceAuction": auctioneer.runSecondPriceAuction
    }
};