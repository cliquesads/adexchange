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
var pmx = require('pmx');
var sendDataToProcessName = require('@cliques/cliques-node-utils').pm2utils.sendDataToProcessName;
var pubsub = require('@cliques/cliques-node-utils').google.pubsub;
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

/* -------------------------------------------------- */
/* ------------------- PUBSUB HOOKS ----------------- */
/* -------------------------------------------------- */

var exchangeConfigPubSub = new pubsub.ExchangeConfigPubSub(pubsub_options);
exchangeConfigPubSub.subscriptions.updateBidderConfig(function(err, subscription){
    if (err) throw new Error('Error creating subscription to updateBidderConfig topic: ' + err);
    // message listener
    subscription.on('message', function(message){
        if (err) throw new Error(err);
        console.log('Received updateBidderConfig message, updating adexchange configs...');
        sendDataToProcessName(PROCESSNAME, { update: "bidderConfig" });
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
        sendDataToProcessName(PROCESSNAME, { update: "defaultsConfig" });
    });
    subscription.on('error', function(err){
        console.log(err);
    });
});

/* -------------------------------------------------- */
/* ------------------- PMX HOOKS -------------------- */
/* -------------------------------------------------- */

function pmxCallback(reply, err, responses){
    if (err){
        return reply({ success: false, err: err });
    }
    var rString = responses.join('\n');
    console.log(rString);
    return reply({success: true, response: rString });
}

pmx.action('updateBidderConfig', function(reply){
    sendDataToProcessName(PROCESSNAME, { update: "bidderConfig" }, function(err, responses){
        pmxCallback(reply,err, responses);
    });
});

pmx.action('updateDefaultsConfig', function(reply){
    sendDataToProcessName(PROCESSNAME, { update: "defaultsConfig" }, function(err, responses){
        pmxCallback(reply,err, responses);
    });
});