var node_utils = require('cliques_node_utils');
var ExchangeModels = node_utils.mongodb.models.ExchangeModels;

function getPublisherData(request, connection, callback){
    /*
    Light wrapper around ExchangeModels.getTagFromID method that restructures data
    according to OpenRTB Bid Request structure
     */
    var models = new ExchangeModels(connection);

    models.getTagFromID(request.query.tag_id, 'secondary', function(err,tag){
        if (err) callback(err);
        // restructure object to make it easier to process in
        // request parsing functions.  Keys in pub_data are meant to
        // comply with OpenRTB object specs EXACTLY so as to be passed
        // directly into bid request parsers
        var pub_data = {
            site_data: {
                id: tag.parent_site._id,
                domain: tag.parent_site.domain_name,
                name: tag.parent_site.name,
                page: tag.parent_page.url,
                publisher: {
                    id: tag.parent_publisher._id,
                    name: tag.parent_publisher.name,
                    domain: tag.parent_publisher.website}
            },
            imp_data: {
                tagid: tag._id,
                bidfloor: tag.bidfloor,
                banner: {h: tag.h,w: tag.w,pos: tag.pos}
            }
        };
        callback(null, pub_data);
    });
}

exports.getPublisherData = getPublisherData;