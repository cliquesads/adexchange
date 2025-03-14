var assert = require("assert");
var connections = require('../lib/connections');
var supertest = require('supertest');
var config = require('config');
var mongoose = require('mongoose');

process.env.NODE_ENV = 'test';

// have to set port before importing or it will try to spin up app on 5000
process.env['EXCHANGE-WEBSERVER-PORT'] = 5200;
var logger = require('../lib/logger');


describe('MongoDB', function(){
    it('Can connect to database: exchange', function(done){
        var db = mongoose.createConnection(connections.exchangeMongoURI, connections.exchangeMongoOptions);
        db.on('connected', function(){
            done();
        });
        db.on('error', function(err){
            done(err);
        })
    });
    it('Can connect to database: user', function(done){
        var db = mongoose.createConnection(connections.userMongoURI, connections.userMongoOptions);
        db.on('connected', function(){
            done();
        });
        db.on('error', function(err){
            done(err);
        })
    });
});

describe('Config', function(){
    it('Can get config for Exchange', function(done){
        var exchange_config = config.get('Exchange');
        done();
    });
});

describe('WebServer', function(){
    //UUID value on incoming request gets propagated to request object for downstream processing
    //var req = {cookies: {uuid: "cc820770-c1e6-11e4-b7ba-e977f4853d86"}};
    var app = require('../index').app;
    describe('GET /', function() {
        it("Responds with 200", function (done) {
            supertest(app)
                .get('/')
                .expect(200, done)
        });
    });
    describe('GET /pub', function(){
        it("Responds with 404", function(done){
            supertest(app)
                .get('/pub')
                .expect(404, done)
        });
    });
});

describe('Auctioneer', function(){

    //var bidders = config.get('Exchange.bidders');
    var br = require('../lib/auctioneer')("flat");
    var timeout = config.get('Exchange.bidder_timeout');
    var auctioneer = new br.Auctioneer({}, timeout, logger.devNullLogger);

    describe('MultiSeatBids', function(){
        it("Should return highest bid as the winner, with clearprice of second highest bid + $0.01", function () {
            var test_bids_single_obj = [
                {
                    "id": "7367a940-c526-11e4-9d22-a5269bd04333", "bidid": 2029191609, "cur": "USD", "seatbid": [{
                    "seat": 8433,
                    "bid": [
                        {"id": 5597483, "impid": "230429219812962", "price": 5.94},
                        {"id": 55397343, "impid": "230429219812270", "price": 4.24}, // test different impids as well
                        {"id": 55397347, "impid": "230429219812270", "price": 7.92}, // test different impids as well
                        {"id": 95885061, "impid": "230429219812962", "price": 2.75},
                        {"id": 41452679, "impid": "230429219812962", "price": 1.02},
                        {"id": 54945329, "impid": "230429219812962", "price": 2.3},
                        {"id": 15472432, "impid": "230429219812962", "price": 2.69},
                        {"id": 45523916, "impid": "230429219812962", "price": 1.34},
                        {"id": 68110451, "impid": "230429219812962", "price": 6.6} //winning bid
                    ]
                }]
                }
            ];
            var bids = br.flattenBidObjects(test_bids_single_obj);
            auctioneer.runAuction({}, bids[230429219812962], function(err, winning_bid){
                assert.equal(winning_bid.id, 68110451);
                assert.equal(winning_bid.clearprice, 5.95);
            });
            auctioneer.runAuction({},bids[230429219812270], function (err, winning_bid) {
                assert.equal(winning_bid.id, 55397347);
                assert.equal(winning_bid.clearprice, 4.25);
            });
        });
    });
    describe('MultiBidObjects', function(){
        it("Should return highest bid for each impression as the winner, with clearprice of second highest bid + $0.01", function () {
            var test_bids_multi_obj = [
                {"id": "268bd720-c528-11e4-8524-6fd57e6c05e5","bidid": 54156237771,"cur": "USD","seatbid":
                    [{"seat": 8475,"bid": [{"id": 86422736,"impid": "231159286491452","price": 3.95}]}]
                },
                {"id": "268bd720-c528-11e4-8524-6fd57e6c05e5","bidid": 97792700073,"cur": "USD","seatbid":
                    [{"seat": 6847,"bid": [{"id": 49304716,"impid": "231159286491452","price": 5.12}]}]
                },
                {"id": "268bd720-c528-11e4-8524-6fd57e6c05e5","bidid": 38171458733,"cur": "USD","seatbid":
                    [{"seat": 3018,"bid": [{"id": 40577572,"impid": "231159286491452","price": 8.76}]}]
                },
                {"id": "268bd720-c528-11e4-8524-6fd57e6c05e5","bidid": 19010985550,"cur": "USD","seatbid":
                    [{"seat": 364,"bid": [{"id": 60555272,"impid": "231159286491452","price": 6.1}]}]
                },
                {"id": "268bd720-c528-11e4-8524-6fd57e6c05e5","bidid": 33675377327,"cur": "USD","seatbid":
                    [{"seat": 4148,"bid": [{"id": 80503120,"impid": "231159286491452","price": 1.83}]}]
                },
                {"id": "268bd720-c528-11e4-8524-6fd57e6c05e5","bidid": 21633179206,"cur": "USD","seatbid":
                    [{"seat": 9744,"bid": [{"id": 47271633,"impid": "231159286491452","price": 3.18}]}]
                },
                {"id": "268bd720-c528-11e4-8524-6fd57e6c05e5","bidid": 21633172873,"cur": "USD","seatbid":
                    [{"seat": 974,"bid": [{"id": 47368292,"impid": "211159286491762","price": 2.11}]}]
                },
                {"id": "268bd720-c528-11e4-8524-6fd57e6c05e5","bidid": 37928839928,"cur": "USD","seatbid":
                    [{"seat": 972,"bid": [{"id": 38929028,"impid": "211159286491762","price": 5.01}]}]
                },
                {"id": "268bd720-c528-11e4-8524-6fd57e6c05e5","bidid": 31455981801,"cur": "USD","seatbid":
                    [{"seat": 8583,"bid": [{"id": 48705300,"impid": "231159286491452","price": 6.58}]}]
                }
            ];
            var bids = br.flattenBidObjects(test_bids_multi_obj);

            auctioneer.runAuction({},bids[231159286491452], function (err, winning_bid) {
                assert.equal(winning_bid.id, 40577572);
                assert.equal(winning_bid.clearprice, 6.59);
            });

            auctioneer.runAuction({},bids[211159286491762], function (err, winning_bid) {
                assert.equal(winning_bid.id, 38929028);
                assert.equal(winning_bid.clearprice, 2.12);
            });
        });
    });
});

describe('BottomUpAuctioneer', function(){

    var timeout = config.get('Exchange.bidder_timeout');
    var br = require('../lib/auctioneer')("bottomUp");
    var auctioneer = new br.Auctioneer({}, timeout, logger.devNullLogger);
    var test_bids = [
        {
            "id": "7367a940-c526-11e4-9d22-a5269bd04333", "bidid": 2029191609, "cur": "USD", "seatbid": [
            {
                "seat": "Bottom Clique",
                "bid": [
                    {"id": 5597483, "impid": "230429219812962", "price": 5.94},
                    {"id": 5592803, "impid": "230429219372902", "price": 2.25}
                ]
            },
            {
                "seat": "One Level Up",
                "bid": [
                    {"id": 4795597483, "impid": "230429219812962", "price": 20}
                ]
            },
            {
                "seat": "Two Levels Up",
                "bid": [
                    {"id": 55923881, "impid": "230429219372902", "price": 4.25}
                ]
            },
            {
                "seat": "Three Levels Up",
                "bid": [
                    {"id": 53889597483, "impid": "230429219812962", "price": 5.94},
                    {"id": 55974833297, "impid": "230429219812962", "price": 9}
                ]
            }
        ]
        }
    ];
    var bottom_placement = {
        parent_site: {
            clique: {
                id: 'Bottom Clique',
                parent: 'One Level Up',
                ancestors: ['One Level Up', 'Two Levels Up', 'Three Levels Up']
            }
        }
    };
    var two_up_placement = {
        parent_site: {
            clique: {
                id: 'Two Levels Up',
                parent: 'Three Levels Up',
                ancestors: ['Three Levels Up']
            }
        }
    };

    var new_bids = br.flattenBidObjects(test_bids);
    describe('Bottom Up Auction', function(){
        it("Bid Request from Bottom placement should return winner from Bottom Clique ", function () {
            auctioneer.runAuction(bottom_placement,new_bids[230429219812962], function (err, winning_bid) {
                assert.equal(winning_bid.id, 5597483);
                assert.equal(winning_bid.clearprice, 5.94);
            });
            auctioneer.runAuction(bottom_placement,new_bids[230429219372902], function (err, winning_bid) {
                assert.equal(winning_bid.id, 5592803);
                assert.equal(winning_bid.clearprice, 2.25);
            });
        });
        it("Bid Request from two-up placement should return winner from third-up, if two-up clique has no bids", function () {
            auctioneer.runAuction(two_up_placement,new_bids[230429219812962], function (err, winning_bid) {
                assert.equal(winning_bid.id, 55974833297);
                assert.equal(winning_bid.clearprice, 5.95);
            });
            auctioneer.runAuction(two_up_placement,new_bids[230429219372902], function (err, winning_bid) {
                assert.equal(winning_bid.id, 55923881);
                assert.equal(winning_bid.clearprice, 4.25);
            });
        });
    });
});



var googleutils = require('@cliques/cliques-node-utils').google;
var jwt_credentials_file = googleutils.auth.DEFAULT_JWT_SECRETS_FILE;
var bq_scope = 'https://www.googleapis.com/auth/bigquery';

describe('Google API', function(){
    describe('Authentication', function(){
        describe('JWT Token', function(){
            it('Can authenticate using default JWT credentials stored in '+
            jwt_credentials_file + ' with BigQuery scope', function(done){
                googleutils.auth.getJWTAuthClient(jwt_credentials_file,bq_scope,function(err, auth){
                    if (err) return done(err);
                    return done();
                });
            });
        });
    });
});