var config = require('config');
var querystring = require('querystring');
var jade = require('jade');
var TEST_PLACEMENTS = config.get("Exchange.test.placement");

module.exports = function(publisherModels, auctioneer){
    return {
        rtb_test: function (request, response) {
            // fake the referer address just for show in the request data object
            request.headers.referer = 'http://' + request.headers['host'] + request.originalUrl;
            // generate request data again just for show
            var pid = TEST_PLACEMENTS.display.id;
            request.query = {"pid": pid };
            var qs = querystring.encode(request.query);
            publisherModels.getNestedObjectById(request.query.pid, 'Placement', function (err, placement) {
                if (err) logger.error(err);
                auctioneer._create_bid_request(placement, request, function (err, request_data) {
                    var fn = jade.compileFile('./templates/rtb_test.jade', null);
                    var html = fn({request_data: JSON.stringify(request_data, null, 2), qs: qs});
                    response.send(html);
                });
            });
        },
        test_ad: function (pubTag, request, response) {
            publisherModels.getNestedObjectById(TEST_PLACEMENTS.native.id, 'Placement', function (err, placement1) {
                if (err) console.log(err);
                var rendered1 = pubTag.render(placement1);
                publisherModels.getNestedObjectById(TEST_PLACEMENTS.multiUnitNative.id, 'Placement', function (err, placement2) {
                    if (err) console.log(err);
                    var fn = jade.compileFile('./templates/test_ad.jade', null);
                    var rendered2 = pubTag.render(placement2);
                    var html = fn({pubtag1: rendered1, pubtag2: rendered2});
                    response.send(html);
                });
            });
        }
    }
};