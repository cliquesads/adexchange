var pug = require('pug');
var node_utils = require('@cliques/cliques-node-utils');
var config = require('config');
var _ = require('lodash');
var urls = node_utils.urls;

var adserver_hostname = config.get('AdServer.http.external.hostname');
var adserver_secure_hostname = config.get('AdServer.https.external.hostname');
var adserver_port = config.get('AdServer.http.external.port');
var adserver_secure_port = config.get('AdServer.https.external.port');

/**
 * Module isolates logic for generating creative markup given a successful auction.
 *
 * Depending on what placement type is called, there are different types of markup that
 * need to be returned to the client to load the ad correctly.
 */

/**
 * It's too complicated now to figure out how to toggle creative markup
 * for http/https in the bidder, so this is a horrible hack to do it before
 * rendering the ad tag instead.  Basically just replacing non-secure for
 * secure adserver host in ad markup returned from bidder.
 * @param adm
 */
var horribleHttpsAdMarkupHack = function(adm){
    var httpAdserverUrl = 'http://' + adserver_hostname;
    var httpsAdserverUrl = 'https://' + adserver_secure_hostname;
    return adm.replace(httpAdserverUrl, httpsAdserverUrl);
};

/**
 * Function to get native placement data in which we explicitly assign properties to the object
 * returned to client. Don't want to just blindly pass the object and all of its properties through
 * in case some properties aren't meant to be used client-side.
 *
 * @param placement Placement object
 * @param formFactor either 'desktop' or 'mobile'
 */
var getNativePlacementData = exports.getNativePlacementData = function(placement, formFactor){
    return {
        brandDisclosurePrefix: placement.native.brandDisclosurePrefix,
        advertisementDisclosure: placement.native.advertisementDisclosure,
        copyShortMaxLength: placement.native.copyShortMaxLength,
        copyLongMaxLenth: placement.native.copyLongMaxLength,
        template: placement.native[formFactor].template,
        minImageHeight: placement.native.minImageHeight,
        minImageWidth: placement.native.minImageWidth
    }
};

/**
 * Function to get multiPaneNative placement data in which we explicitly assign properties to the object
 * returned to client. Don't want to just blindly pass the object and all of its properties through
 * in case some properties aren't meant to be used client-side.
 *
 * @param placement Placement object
 * @param formFactor either 'desktop' or 'mobile'
 */
var getMultiPaneNativePlacementData = exports.getMultiPaneNativePlacementData = function(placement, formFactor){
    return {
        count: placement.multiPaneNative.count,
        pane: {
            brandDisclosurePrefix: placement.multiPaneNative.pane.brandDisclosurePrefix,
            advertisementDisclosure: placement.multiPaneNative.pane.advertisementDisclosure,
            copyShortMaxLength: placement.multiPaneNative.pane.copyShortMaxLength,
            copyLongMaxLenth: placement.multiPaneNative.pane.copyLongMaxLength,
            template: placement.multiPaneNative.pane[formFactor].template,
            minImageHeight: placement.multiPaneNative.pane.minImageHeight,
            minImageWidth: placement.multiPaneNative.pane.minImageWidth
        },
        wrapper: {
            template: placement.multiPaneNative.wrapper[formFactor].template
        }
    }
};

/**
 * Gets debug object if URL debug query param is set to true.
 *
 * @param pubURL
 * @param winningBidObject
 * @param bid_request
 * @param placement
 * @returns {{winningBid: *, pubURL: *, bid_request: *, placement: *}}
 * @private
 */
var getDebugMarkup = exports.getDebugMarkup = function(pubURL, winningBidObject, bid_request, placement){
    if (pubURL.debug == 'true'){
        return {
            winningBid: winningBidObject,
            pubURL: pubURL,
            bidRequest: bid_request,
            placement: placement
        }
    }
};

/**
 * Determines type of markup to return to impression request based on placement
 * type and generates the markup.
 *
 * @type {exports.getMarkup}
 */
var getMarkup = exports.getMarkup = function(req, placement, secure, winningBidObject, bid_request, pubURL){

    /**
     * Hacky way to do this w/ iFrame ad markup.
     *
     * Populates macros in `adm` ad server URL returned from winning bidder's bid object, and
     * adds any additional parameters to it that need to be passed to the adserver.
     *
     * NOTE: WILL NOT POPULATE EXTERNAL IDS IF PASSED IN.
     * TODO: This means external IDs will not work for display ads for now.
     *
     * @param impid
     * @param adm
     * @returns {*}
     * @private
     */
    var _formatDisplayIframe = function(impid, adm){
        // If this is a display placement (`type === 'display'), this will be an iFrame.
        // If it's a native placement, it will be just the adserver URL.
        adm = secure ? horribleHttpsAdMarkupHack(adm) : adm;
        adm = urls.expandURLMacros(adm, {
            bidid: bid_request.id.toString(),
            impid: impid,
            pid: pubURL.pid,
            ref: encodeURIComponent(req.get('Referrer')),
            aid: bid_request.id.toString()
        });
        return adm
    };

    /**
     * Proper way to reformat impression URL, using ImpURL class. Populates
     * macros and adds external IDs as well. Will pass external IDs as well.
     */
    var _formatImpUrl = function(impid, adm){
        var impUrl = urls.ImpURL.fromRawUrl(adm, adserver_hostname, adserver_secure_hostname,
            adserver_port, adserver_secure_port);
        impUrl.external = pubURL.external;
        return impUrl.format({
            bidid: bid_request.id.toString(),
            impid: impid,
            pid: pubURL.pid,
            ref: encodeURIComponent(req.get('Referrer')),
            aid: bid_request.id.toString()
        }, secure);
    };

    var markup, impid, adserverUrl, debugMarkup;
    // TODO: Assumed 'form-factor' is set on PubURL, which it might not be long-term
    // will be null for display
    var formFactor = pubURL['form-factor'];
    switch (placement.type){
        case "native":
            // If placement is native, don't send markup, send JSON w/ placement.native object as well
            // as winning adserver URL
            impid = Object.keys(winningBidObject)[0];
            adserverUrl = _formatImpUrl(impid, winningBidObject[impid].adm);
            markup = getNativePlacementData(placement, formFactor);
            markup.adm = adserverUrl;
            debugMarkup = getDebugMarkup(pubURL,winningBidObject,bid_request, placement);
            if (debugMarkup) markup.debug = debugMarkup;
            break;
        case "multiPaneNative":
            // in this case there are multiple impressions being served, so need to create array
            // of response objects
            // first get placement-level native object data that won't depend on winning advertiser's adm
            // TODO: Assumed 'form-factor' is set on PubURL, which it might not be long-term
            markup = getMultiPaneNativePlacementData(placement, formFactor);
            markup.adms = [];

            // sort by impid, which is generated from process.hrftime(), so that returned array index sequencing
            // follows impid sequencing
            var sorted = Object.keys(winningBidObject).sort();
            for (var i = 0; i < sorted.length; i++){
                var id = sorted[i];
                // still should check if has own property
                if (winningBidObject.hasOwnProperty(id)){
                    // format adserver URL first, then create individual native JSON
                    adserverUrl = _formatImpUrl(id, winningBidObject[id].adm);
                    markup.adms.push(adserverUrl);
                }
            }
            debugMarkup = getDebugMarkup(pubURL,winningBidObject,bid_request, placement);
            if (debugMarkup) markup.debug = debugMarkup;
            break;
        default:
            // TODO: Not responding with JSON object for display ads right now, so can't easily send
            // TODO: debug markup when responding.
            impid = Object.keys(winningBidObject)[0];
            markup = _formatDisplayIframe(impid, winningBidObject[impid].adm);
    }
    return markup;
};


