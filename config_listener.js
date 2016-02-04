/**
 * Independent process that listens for config updates to adexchange
 * & sends signals to exchange processes when an update is needed
 * via PM2 API.
 *
 * TODO: This should really be rewritten as a wrapper launch/deploy script
 * TODO: for all adexchange processes, rather than a standalone process.
 *
 * @type {CLI|exports}
 */

var pm2 = require('pm2');
var pubsub = require('cliques_node_utils').google.pubsub;
var async = require('async');
var PROCESSNAME = process.env.NODE_ENV === 'production' ? 'adexchange' : 'adexchange_' + process.env.NODE_ENV;

/*  ------------------- PubSub Init & Subscription Hooks------------------- */

// Here's where the config methods actually get hooked to signals from
// the outside world via Google PubSub api.

if (process.env.NODE_ENV == 'local-test'){
    var pubsub_options = {
        projectId: 'mimetic-codex-781',
        test: true,
        logger: logger
    }
} else {
    pubsub_options = {projectId: 'mimetic-codex-781'};
}

/**
 * Wrapper around very fragile pm2 API function to isolate logic
 *
 * As of 1.0.0, documentation for sendDataToProcessId is almost nonexistent, and
 * what documentation exists is entirely wrong. This function exists solely to separate this
 * likely-deprecated API call from its parent routine.
 *
 * @param id process id (pm_id)
 * @param data data object to pass to sub process
 * @param cb
 * @private
 */
var _sendData = function(id, data, cb){
    pm2.sendDataToProcessId(id, {
        topic : 'process:msg',
        data : data,
        id   : id
    }, function(err, res){
        if (err){
            console.log(err);
        }
        console.log('Message sent to pm2 pm_id ' + id + '. Received response: ' + JSON.stringify(res));
        if (cb) return cb(err, res);
    });
};

/**
 * Gets all active pm2 processes for given processname and passes data object to them
 * over 'process:msg' topic
 *
 * @type {Function}
 */
var sendDataToProcess = exports.sendDataToProcess = function(processname, data){
    pm2.connect(function(err){
        if (err) {
            console.log(err);
            pm2.disconnect();
        }
        pm2.list(function(err, list){
            if (err) {
                console.log(err);
                pm2.disconnect();
            }
            async.each(list, function(process, callback){
                if (process.name === processname){
                    var id = process.pm2_env.pm_id;
                    _sendData(id, data, function(err, res){
                        callback(err);
                    });
                }
            }, function(err){
                if (err) console.log(err);
                pm2.disconnect();
            });
        });
    });
};

var exchangeConfigPubSub = new pubsub.ExchangeConfigPubSub(pubsub_options);
exchangeConfigPubSub.subscriptions.updateBidderConfig(function(err, subscription){
    if (err) throw new Error('Error creating subscription to updateBidderConfig topic: ' + err);
    // message listener
    subscription.on('message', function(message){
        if (err) throw new Error(err);
        console.log('Received updateBidderConfig message, updating adexchange configs...');
        sendDataToProcess(PROCESSNAME, { update: "bidderConfig" });
    });
    subscription.on('error', function(err){
        console.log(err);
    });
});

exchangeConfigPubSub.subscriptions.updateDefaultsConfig(function(err, subscription){
    if (err) throw new Error('Error creating subscription to updateDefaultsConfig topic: ' + err);
    // message listener
    subscription.on('message', function(message){
        if (err) throw new Error(err);
        console.log('Received updateDefaultsConfig message, updating adexchange configs...');
        sendDataToProcess(PROCESSNAME, { update: "defaultsConfig" });
    });
    subscription.on('error', function(err){
        console.log(err);
    });
});