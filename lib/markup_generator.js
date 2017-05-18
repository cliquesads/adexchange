var jade = require('jade');

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


var getMarkup = exports.getMarkup = function(req, placement, winningBidObject, pubURL){
    // If this is a display placement (`type === 'display'), this will be an iFrame.
    // If it's a native placement, it will be just the adserver URL.
    var adm = secure ? horribleHttpsAdMarkupHack(winningBidObject.adm) : winningBidObject.adm;
    adm = urls.expandURLMacros(adm, {
        impid: winningBidObject.impid, pid: pubURL.pid, ref: encodeURIComponent(req.get('Referrer'))
    });

    // If placement is native, don't send markup, send JSON w/ placement.native object as well
    // as winning adserver URL
    var markup = adm;
    if (placement.type === 'native'){
        // TODO: Assumed 'form-factor' is set on PubURL, which it might not be long-term
        var formFactor = pubURL['form-factor'];
        // if formFactor is inactive, send back default template as a placeholder
        // if (!placement.native[formFactor].active){
        //     var fn = jade.compileFile('./templates/default_native_template.jade', null);
        //     var html = fn({ consoleUrl: 'https://console.cliquesads.com/', formFactor: formFactor });
        // }
        markup = {
            brandDisclosurePrefix: placement.brandDisclosurePrefix,
            advertisementDisclosure: placement.advertisementDisclosure,
            copyShortMaxLength: placement.copyShortMaxLength,
            copyLongMaxLenth: placement.copyLongMaxLength,
            template: placement.native[formFactor].template,
            adm: adm
        };
    }
    return markup;
};


