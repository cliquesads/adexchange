# Cliques Exchange

The Cliques Ad Exchange, a Node.js app using [Express 4](http://expressjs.com/).

Handles incoming requests for impressions, runs real-time auctions from remote bidders, and responds with the winning bidder's ad markup.

All requests and responses follow [OpenRTB 2.3](https://github.com/openrtb/OpenRTB) protocols.

## Running Locally

First, make sure you have [Node.js](http://nodejs.org/) installed.

```sh
$ git clone git@github.com:cliquesads/adexchange.git # or clone your own fork
$ cd adexchange
$ npm install
$ node index.js
```

Your app should now be running on [localhost:5100](http://localhost:5100/).

## Deploying to Heroku

```
$ heroku create
$ git push heroku master
$ heroku open
```

## Documentation

For more information about using Node.js on Heroku, see these Dev Center articles:

- [Getting Started with Node.js on Heroku](https://devcenter.heroku.com/articles/getting-started-with-nodejs)
- [Heroku Node.js Support](https://devcenter.heroku.com/articles/nodejs-support)
- [Node.js on Heroku](https://devcenter.heroku.com/categories/nodejs)
- [Best Practices for Node.js Development](https://devcenter.heroku.com/articles/node-best-practices)
- [Using WebSockets on Heroku with Node.js](https://devcenter.heroku.com/articles/node-websockets)
