var node_utils = require('cliques_node_utils');
var config = require('config');
var util = require('util');

// Build the connection string
var dbURI = util.format('mongodb://%s:%s/%s',
    config.get('Exchange.mongodb.secondary.host'),
    config.get('Exchange.mongodb.secondary.port'),
    config.get('Exchange.mongodb.db'));

var options = {
    user: config.get('Exchange.mongodb.user'),
    pass: config.get('Exchange.mongodb.pwd'),
    auth: {authenticationDatabase: config.get('Exchange.mongodb.db')}
};

// need to call connect wrapper in order to connect mongoose instance in
// node_utils, otherwise any queries using node_utils models will not work
node_utils.mongodb.db.mongooseConnectWrapper(dbURI, options);

function getPublisherData(request, callback){
    /*
    I'm not proud of this query function, probably could be done more efficiently
    but I can't figure out how.
     */
    var query = node_utils.mongodb.models.Publisher.findOne({
        'sites.pages.tags._id': request.query.tag_id
    });
    query.read('secondary').exec(
        function(err, pub){
            if (err) return callback(err);
            if (pub){
                // TODO: got to be a better way to do this, or is this just
                // TODO: the accepted way of querying deeply nested documents?
                pub.sites.forEach(function(site){
                    site.pages.forEach(function(page){
                        page.tags.forEach(function(tag){
                            if (tag._id == request.query.tag_id){
                                // restructure object to make it easier to process in
                                // request parsing functions.  Keys in pub_data are meant to
                                // comply with OpenRTB object specs EXACTLY so as to be passed
                                // directly into bid request parsers
                                var pub_data = {
                                    site_data: {
                                        id: site._id,
                                        domain: site.domain_name,
                                        name: site.name,
                                        page: page.url,
                                        publisher: {id: pub._id,name: pub.name,domain: pub.website}
                                    },
                                    imp_data: {
                                        tagid: tag._id,
                                        bidfloor: tag.bidfloor,
                                        banner: {h: tag.h,w: tag.w,pos: tag.pos}
                                    }
                                };
                                callback(null,pub_data);
                            }
                        });
                    });
                });
            } else {
                var e = util.format('No placements with ObjectId %s found', request.query.tag_id);
                callback(e);
            }
        }
    );
}

exports.getPublisherData = getPublisherData;