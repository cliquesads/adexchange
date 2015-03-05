var node_utils = require('cliques_node_utils');
var config = require('config');
var util = require('util');

//// Build the connection string
var dbURI = util.format('mongodb://%s:%s/%s',//?readPreference=secondaryPreferred',
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
        'sites.paths.placements._id': request.query.placement
    });
    query.read('secondary').exec(
        function(err, result){
            if (err) return callback(err);
            if (result){
                // TODO: got to be a better way to do this, or is this just
                // TODO: the accepted way of querying deeply nested documents?
                result.sites.forEach(function(site){
                    site.paths.forEach(function(path){
                        path.placements.forEach(function(placement) {
                            if (placement._id == request.query.placement) {
                                callback(null,placement);
                            }
                        });
                    });
                });
            } else {
                var e = util.format('No placements with ObjectId %s found', request.query.placement);
                callback(e);
            }
        }
    );
}

exports.getPublisherData = getPublisherData;

//get_publisher({query: {placement: "54f7c1b42d44eafa3887e0d4"}}, function(err, result){
//    if (err) console.log(err);
//    console.log(result)
//});