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
$ ./deploy_production.sh
```

# Issues

There can be an issue running on Node 0.12.0 at high levels of concurrency where Node will throw the error:

```
error:  Error: connect EADDRNOTAVAIL
```

This seems to be caused by a shortage of sockets available for connection.  Supposedly, the global HTTP Agent `maxSockets` setting in previous node versions (0.10.x) was set to 5 by default, which various online sources have cited as a common source for this issue:

[LinkedIn Engineering Blog](http://engineering.linkedin.com/nodejs/blazing-fast-nodejs-10-performance-tips-linkedin-mobile)
[WebAppLog - Seven Things You Should Stop Doing with Node](http://webapplog.com/seven-things-you-should-stop-doing-with-node-js/)
[StackOverflow Post 1](http://stackoverflow.com/questions/21859537/connect-eaddrnotavail-in-nodejs-under-high-load-how-to-faster-free-or-reuse-tc)

## UPDATE
This seems to be a system issue with the number of local ports made available.  By default, Ubuntu 12.04 in GCE sets local port range to `32768	61000`, giving you 28,232 local ports to work with.

To check, run:

```
cat /proc/sys/net/ipv4/ip_local_port_range
```

Or:

```
sysctl net.ipv4.ip_local_port_range
```

Not sure of the reasoning behind this, but under heavy load this will cause outbound HTTP requests to fail due to lack of ports available.  I've increased this range on one machine to:

```
1024    65535
```

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