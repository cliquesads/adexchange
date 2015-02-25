var config = require('config');
var uuid = require('node-uuid');
require('date-utils'); // hook for date-utils module

exports.get_or_set_uuid = get_or_set_uuid;

function _get_or_set_cookie(request, response, new_cookie_vals, days_expiration, callback){
    /* Generic function to handles cookie setting & getting.

     Assumes that cookie-parser middleware is installed (calls request.cookie)

     If cookie key,val is found in request (for each key,val passed in new_cookie_vals object)
     then that cookie's expiration is updated and existing key,val are returned.

     If not, then set cookie & return the new key,val pair

     results is an object keyed on new_cookie_vals keys, but contains sub-object for each key
     to differentiate values on request & response.  request value will be null if none. E.g.:

     {uuid: {request: null, response: '939994j-2800dnwj-393xnnl-88002'}}

     Written as async right now (i.e. takes callback) but effectively is sync, could probably
     be handled better */

    // First set cookie options
    var max_age = days_expiration * 24 * 60 * 60 * 1000;
    var now = new Date;
    var expiration = now.addDays(days_expiration);
    var secure = false;
    if (request.protocol == 'https'){ secure = true; }
    var cookie_options = {
        'maxAge': max_age,
        'expires': expiration,
        'secure': secure,
        'httpOnly': true
    };

    // Get or set cookie values, store in results
    try {
        var results = {};
        for (var key in new_cookie_vals) {
            if (new_cookie_vals.hasOwnProperty(key)) {
                if (request.cookies[key]) {
                    // set cookie val to new val if none found
                    var val = request.cookies[key];
                    response.cookie(key, val, cookie_options);
                    results[key] = {"request": val,"response": val}
                } else {
                    // otherwise just return the value found
                    // TODO: add cookie signing in here
                    response.cookie(key, new_cookie_vals[key], cookie_options);
                    results[key] = {"request": null, "response": new_cookie_vals[key]};
                }
            }
        }
    } catch (e) {
        callback(e);
    }
    callback(null, results);
}

function get_or_set_uuid(req, res, next){
    /* Middleware fuction to get or set UUID cookie. Adds UUID to request object
     to send to bidders. */
    var new_cookie_vals = {'uuid': uuid.v1()};
    // Set expiration of UUID cookie in config
    var days_expiration = config.get('Exchange.cookies.expirationdays');
    _get_or_set_cookie(req, res, new_cookie_vals, days_expiration, function(err, results){
        if (err) throw err;
        req.old_uuid = results.uuid.request;
        req.uuid = results.uuid.response;
        next();
    });
}

