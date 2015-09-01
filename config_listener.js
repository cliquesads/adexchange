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

function sendSignal(processname){
    pm2.connect(function(err){
        if (err) {
            console.log(err);
            pm2.disconnect();
        }
        // TODO: Don't really like this, would like to use STDIN for child processes instead
        pm2.sendSignalToProcessName('SIGUSR2', processname, function(err, ret){
            if (err) console.log(err);
            console.log('SIGUSR2 Signal Sent, Exchange configs updated');
            pm2.disconnect();
        });
    });
}

var exchangeConfigPubSub = new pubsub.ExchangeConfigPubSub(pubsub_options);
exchangeConfigPubSub.subscriptions.updateBidderConfig(function(err, subscription){
    if (err) throw new Error('Error creating subscription to updateBidderConfig topic: ' + err);
    // message listener
    subscription.on('message', function(message){
        if (err) throw new Error(err);
        console.log('Received updateBidderConfig message, updating adexchange configs...');
        sendSignal('adexchange');
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
        sendSignal('adexchange');
    });
    subscription.on('error', function(err){
        console.log(err);
    });
});