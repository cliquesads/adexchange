/**
 * Main endpoint function to handle incoming impression requests & respond with winning ad markup.
 * Does the following, in order:
 * 1) Logs incoming request
 * 2) Retrieves bids via HTTP POST requests using OpenRTB 2.3 bid request object
 * 3) Runs 2nd-price Vickrey auction based on bid-responses
 * 4) Returns winning ad markup in HTTP JSON response
 * 5) Logs response w/ winning bid metadata
 * 6) Sends win-notice via HTTP GET to winning bidder
 */
module.exports = function(logger, publisherModels, auctioneer, defaultConditionHandler, markupGenerator) {
    return {
        main: function(pubURL, parent_tag_type, secure, request, response){
            // get placement from MongoDB, then kick of subsequent tasks in callbacks
            publisherModels.getNestedObjectById(
                pubURL.pid,
                'Placement',
                ['sites.pages.clique', 'sites.clique'],
                function (err, placement) {
                    if (err) {
                        // Fail if placement can't even be looked up.
                        response.status(404).send("ERROR 404: Placement ID " + pubURL.pid + " not found.");
                        logger.error("GET Request send to /pub with invalid placement_id: " + pubURL.pid);
                    } else {
                        auctioneer.main(
                            placement,
                            request,
                            response,
                            pubURL,
                            function (err, winning_bid, bid_request) {
                                if (err) {
                                    // handle default condition if error
                                    defaultConditionHandler.main(bid_request,
                                        err,
                                        placement,
                                        secure,
                                        parent_tag_type,
                                        pubURL,
                                        function (err, markup, defaultType) {
                                            if (err) {
                                                response
                                                    .status(404)
                                                    .send("ERROR 404: Cannot get default condition markup");
                                            }
                                            response.send(markup);
                                            logger.auction_default(err, placement, defaultType, request, bid_request);
                                        });
                                } else {
                                    var markup = markupGenerator.getMarkup(
                                        request,
                                        placement,
                                        secure,
                                        winning_bid,
                                        bid_request,
                                        pubURL);
                                    response.send(markup);
                                }
                                logger.httpResponse(response);
                                logger.auction(err, placement, request, response, winning_bid, bid_request);
                            });
                    }
                });
        }
    };
};
