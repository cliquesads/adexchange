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

Your app should now be running on [localhost:5000](http://localhost:5000/).

## Installing New Dependencies

Dependencies are sweet. NPM makes them super easy to download and install. But to ensure that any new dependencies get deployed (and that the build doesn't fail), you must use the '--save' flag when you use NPM:

```sh
$ npm install --save some-library
```

This way, the dependency will be added to "dependencies" in package.json.

## Running in Production

First, make sure the repository is cloned into the appropriate directory. Then:

```
$ git pull
$ npm install #install any dependencies
$ source activate_production.sh
$ pm2 start index.js --name adexchange -i 0 # this will run the exchange on all available CPU's
```

# Issues

At the moment, running on Node 0.10.x, there is an issue at high levels of concurrency where Node will throw the error:

```
error:  Error: connect EADDRNOTAVAIL
```

This seems to be caused by a shortage of sockets available for connection.  This might be fixed  


# Key Dependencies

## Geo Lookup

IP-Geo lookup is handled by MaxMind using their paying [GeoIP2 City Database binary](https://www.maxmind.com/en/geoip2-city), and [node-maxmind](https://github.com/runk/node-maxmind), the pure JS API for this database.

Currently, you must use the "legacy" `GeoIPCity.dat` binary, as the newer GeoIP2 `.mmdb` files are not yet supported by node-maxmind.

### IMPORTANT

The database file needs to be stored in `~/data/maxmind/GeoIPCity.dat`, otherwise the server will crash immediately.

## User-Agent Parsing

This is handled by a combination of [ua-parser2](https://github.com/commenthol/ua-parser2) and [mobile-detect](https://github.com/hgoebl/mobile-detect.js).

ua-parser2 was chosen because it is based on the most widely-used user-agent parsing regex collection out there, [ua-parser](https://github.com/tobie/ua-parser).  There are some other js libraries to handle this task, but I think this is the most robust.

mobile-detect is only used to discern between phone and tablet user-agent strings at the `devicetype` level, which is not a trivial task.  It is only invoked if the devicetype is determined to be mobile, it never gets called for desktops.