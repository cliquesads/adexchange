var jade = require('jade');
var node_utils = require('@cliques/cliques-node-utils');
var config = require('config');
var _ = require('lodash');
var urls = node_utils.urls;

var adserver_hostname = config.get('AdServer.http.external.hostname');
var adserver_secure_hostname = config.get('AdServer.https.external.hostname');

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

var getNativePlacementData = exports.getNativePlacementData = function(placement, formFactor){
    var nativeObj = (placement.type === 'multiPaneNative') ? placement.multiPaneNative.pane : placement.native;
    return {
        brandDisclosurePrefix: nativeObj.brandDisclosurePrefix,
        advertisementDisclosure: nativeObj.advertisementDisclosure,
        copyShortMaxLength: nativeObj.copyShortMaxLength,
        copyLongMaxLenth: nativeObj.copyLongMaxLength,
        template: nativeObj[formFactor].template,
        minImageHeight: nativeObj.minImageHeight,
        minImageWidth: nativeObj.minImageWidth
    }
};

/**
 * Determines type of markup to return to impression request based on placement
 * type and generates the markup.
 *
 * @type {exports.getMarkup}
 */
var getMarkup = exports.getMarkup = function(req, placement, secure, winningBidObject, pubURL){

    var _formatAdserverUrl = function(adm){
        // If this is a display placement (`type === 'display'), this will be an iFrame.
        // If it's a native placement, it will be just the adserver URL.
        adm = secure ? horribleHttpsAdMarkupHack(adm) : adm;
        adm = urls.expandURLMacros(adm, {
            impid: winningBidObject.impid, pid: pubURL.pid, ref: encodeURIComponent(req.get('Referrer'))
        });
        return adm
    };

    var markup, impid, adserverUrl;
    // TODO: Assumed 'form-factor' is set on PubURL, which it might not be long-term
    // will be null for display
    var formFactor = pubURL['form-factor'];
    switch (placement.type){
        case "native":
            // If placement is native, don't send markup, send JSON w/ placement.native object as well
            // as winning adserver URL
            impid = Object.keys(winningBidObject)[0];
            adserverUrl = _formatAdserverUrl(winningBidObject[impid].adm);
            markup = getNativePlacementData(placement, formFactor);
            markup.adm = adserverUrl;
            break;
        case "multiPaneNative":
            // in this case there are multiple impressions being served, so need to create array
            // of response objects
            // first get placement-level native object data that won't depend on winning advertiser's adm
            // TODO: Assumed 'form-factor' is set on PubURL, which it might not be long-term
            var placementData = getNativePlacementData(placement, formFactor);
            markup = [];
            // sort by impid, which is generated from process.hrftime(), so that returned array index sequencing
            // follows impid sequencing
            var sorted = Object.keys(winningBidObject).sort();
            for (var i = 0; i < sorted.length; i++){
                var id = sorted[i];
                // still should check if has own property
                if (winningBidObject.hasOwnProperty(id)){
                    // format adserver URL first, then create individual native JSON
                    adserverUrl = _formatAdserverUrl(winningBidObject[id].adm);
                    var paneMarkup = _.clone(placementData);
                    paneMarkup.adm = adserverUrl;
                    markup.push(paneMarkup);
                }
            }
            break;
        default:
            impid = Object.keys(winningBidObject)[0];
            markup = _formatAdserverUrl(winningBidObject[impid].adm);
    }
    return markup;
};


