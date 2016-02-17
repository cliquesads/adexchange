//first-party packages
var node_utils = require('@cliques/cliques-node-utils');
var logger = require('./logger');

//third-party packages
//have to require PMX before express to enable monitoring
var path = require('path');
var util = require('util');
var config = require('config');

/* ------------------- MONGODB - EXCHANGE DB ------------------- */

// Build the connection string
var exchangeMongoURI = exports.exchangeMongoURI = util.format('mongodb://%s:%s/%s',
    config.get('Exchange.mongodb.exchange.primary.host'),
    config.get('Exchange.mongodb.exchange.primary.port'),
    config.get('Exchange.mongodb.exchange.db'));
var exchangeMongoOptions = exports.exchangeMongoOptions = {
    user: config.get('Exchange.mongodb.exchange.user'),
    pass: config.get('Exchange.mongodb.exchange.pwd'),
    auth: {authenticationDatabase: config.get('Exchange.mongodb.exchange.db')}
};
exports.EXCHANGE_CONNECTION = node_utils.mongodb.createConnectionWrapper(exchangeMongoURI, exchangeMongoOptions, function(err, logstring){
    if (err) throw err;
    logger.info(logstring);
});


/* ------------------- MONGODB - USER DB ------------------- */

// Build the connection string
var userMongoURI = exports.userMongoURI = util.format('mongodb://%s:%s/%s',
    config.get('Exchange.mongodb.user.primary.host'),
    config.get('Exchange.mongodb.user.primary.port'),
    config.get('Exchange.mongodb.user.db'));

var userMongoOptions = exports.userMongoOptions = {
    user: config.get('Exchange.mongodb.user.user'),
    pass: config.get('Exchange.mongodb.user.pwd'),
    auth: {authenticationDatabase: config.get('Exchange.mongodb.user.db')}
};
exports.USER_CONNECTION = node_utils.mongodb.createConnectionWrapper(userMongoURI, userMongoOptions, function(err, logstring){
    if (err) throw err;
    logger.info(logstring);
});
