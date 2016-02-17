//first-party packages
var node_utils = require('@cliques/cliques-node-utils');
var cliques_cookies = node_utils.cookies;
var logger = require('./logger');

//third-party packages
//have to require PMX before express to enable monitoring
var pmx = require('pmx').init();
var express = require('express');
var https = require('https');
var http = require('http');
var app = express();
var fs = require('fs');
var requestIp = require('request-ip');
var cookieParser = require('cookie-parser');
var responseTime = require('response-time');
var config = require('config');

module.exports = function(userConnection) {

    // inside request-ip middleware handler
    app.use(function(req, res, next) {
        req.clientIp = requestIp.getClientIp(req); // on localhost > 127.0.0.1
        next();
    });
    app.use(cookieParser());
    app.use(responseTime());
    app.set('http_port', config.get('Exchange.http.port') || 5000);
    app.set('https_port', config.get('Exchange.https.port') || 3000);
    app.use(express.static(__dirname + '/public'));

    // custom cookie-parsing middleware
    var days_expiration = config.get('Cookies.expirationdays');
    var domain = config.get('Cookies.domain');
    var cookie_handler = new cliques_cookies.CookieHandler(days_expiration,domain,userConnection);
    app.use(function(req, res, next){
        cookie_handler.get_or_set_uuid(req, res, next);
    });

    // custom HTTP request logging middleware
    app.use(function(req, res, next){
        logger.httpRequestMiddleware(req, res, next);
    });

    // set CORS headers to allow Ajax ad requests
    app.use(function(req, res, next) {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
        next();
    });

    // Create secure & non-secure servers
    http.createServer(app).listen(app.get('http_port'));
    https.createServer({
        key: fs.readFileSync('./config/cert/star_cliquesads_com.key'),
        cert: fs.readFileSync('./config/cert/star_cliquesads_com.crt'),
        ca: fs.readFileSync('./config/cert/DigiCertCA.crt')
    }, app).listen(app.get('https_port'));

    return app;
};
