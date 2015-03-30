var assert = require("assert");
var br = require('../lib/bid_requests');
var supertest = require('supertest');
var config = require('config');
var mongoose = require('mongoose');

process.env.NODE_ENV = 'test';

// have to set port before importing or it will try to spin up app on 5000
process.env['EXCHANGE-WEBSERVER-PORT'] = 5200;
var index = require('../index');

describe('MongoDB', function(){
    it('Can connect to database: exchange', function(done){
        var db = mongoose.createConnection(index.mongoURI, index.mongoOptions);
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
    var app = index.app;
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

    var bidders = config.get('Exchange.bidders');
    var timeout = config.get('Exchange.bidder_timeout');
    var db = mongoose.createConnection(index.mongoURI, index.mongoOptions);
    var auctioneer = new br.Auctioneer(bidders, timeout, db, index.devNullLogger);

    describe('MultiSeatBids', function(){
        it("Should return highest bid as the winner, with clearprice of second highest bid + $0.01", function () {
            var test_bids_single_obj = [
                {
                    "id": "7367a940-c526-11e4-9d22-a5269bd04333", "bidid": 2029191609, "cur": "USD", "seatbid": [{
                    "seat": 8433,
                    "bid": [
                        {"id": 5597483, "impid": "230429219812962", "price": 5.94},
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
            auctioneer.runAuction(test_bids_single_obj, function (err, winning_bid) {
                assert.equal(winning_bid.id, 68110451);
                assert.equal(winning_bid.clearprice, 5.95);
            });
        });
    });
    describe('MultiBidObjects', function(){
        it("Should return highest bid as the winner, with clearprice of second highest bid + $0.01", function () {
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
                {"id": "268bd720-c528-11e4-8524-6fd57e6c05e5","bidid": 31455981801,"cur": "USD","seatbid":
                    [{"seat": 8583,"bid": [{"id": 48705300,"impid": "231159286491452","price": 6.58}]}]
                }
            ];
            auctioneer.runAuction(test_bids_multi_obj, function (err, winning_bid){
                assert.equal(winning_bid.id, 40577572);
                assert.equal(winning_bid.clearprice, 6.59);
            });
        });
    });
});