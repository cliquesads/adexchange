var node_utils = require('@cliques/cliques-node-utils');
var getInactiveError = require('./auctioneer/auctioneer').getInactiveError;
var markupGenerator = require('./markup_generator');
var getNativePlacementData = markupGenerator.getNativePlacementData;
var getMultiPaneNativePlacementData = markupGenerator.getMultiPaneNativePlacementData;
var jade = require('jade');
var config = require('config');
var _ = require('lodash');
var tags = node_utils.tags;
var urls = node_utils.urls;

/**
 * Get test ad markup JSON object to return to client for native ads.
 *
 * @param placement
 * @param pubURL
 */
var getNativeTestMarkup = function(placement, pubURL){
    var nativeTestMarkup = config.get('Native.testCreative');
    var nativePlacementData = getNativePlacementData(placement, pubURL['form-factor']);
    nativeTestMarkup = _.extend(nativeTestMarkup, nativePlacementData);
    nativeTestMarkup.test = true;
    return nativeTestMarkup;
};

/**
 * Get test ad markup JSON object to return to client for multiPaneNative ads.
 *
 * @param placement
 * @param pubURL
 */
var getMultiPaneNativeTestMarkup = function(placement, pubURL){
    var nativeTestMarkup = config.get('Native.testCreative');
    var nativePlacementData = getMultiPaneNativePlacementData(placement, pubURL['form-factor']);
    nativeTestMarkup.test = true;
    nativeTestMarkup.creativeSpecs = [];
    for (var i=0; i < nativePlacementData.count; i++){
        nativeTestMarkup.creativeSpecs.push(nativePlacementData[i]);
    }
    return nativeTestMarkup;
};

/**
 * Constructor for lightweight class to isolate the logic behind choosing
 * default creatives & rendering appropriate tags.
 *
 * Initialize the object w/ defaultAdvertisers object mapping cliques to lists of
 * advertiser objects, and tag options.
 *
 * Shortcut to retrieve defaultAdvertisers object is CliquesModels.getAllDefaultAdvertisers
 *
 * `main` method looks up appropriate default advertisers for placement clique, selects a
 * random creative group from list of eligible creative groups (based on placement dimensions),
 * renders ImpTag w/ selected creative group, populates macros & returns markup.
 *
 * @param defaultAdvertisers object mapping cliques to lists of
 * advertiser objects
 * @param impTagHostname hostname for adserver
 * @param impTagPort
 * @constructor
 */
var DefaultConditionHandler = function(defaultAdvertisers, impTagHostname, impTagSecureHostname, impTagPort){
    this.defaultAdvertisers = defaultAdvertisers;
    this.impTagHostname = impTagHostname;
    this.secureImpTagHostname = impTagSecureHostname;
    this.impTagPort = impTagPort || null;
};

/**
 * Primary public method which gets default condition markup given a bid request
 *
 * @param bid_request
 * @param auction_error
 * @param placement
 * @param secure
 * @param parent_tag_type
 * @param pubURL
 * @param callback
 * @returns {*}
 */
DefaultConditionHandler.prototype.main = function(bid_request, auction_error, placement, secure, parent_tag_type, pubURL, callback){
    // default to false for secure
    secure = secure || false;
    // if native, return test creative markup if placement is inactive.
    if ((placement.type === 'native' || placement.type === 'multiPaneNative')
        && auction_error === getInactiveError(placement)){
        var nativeTestMarkup;
        switch (placement.type){
            case 'native':
                nativeTestMarkup = getNativeTestMarkup(placement, pubURL);
                break;
            case 'multiPaneNative':
                nativeTestMarkup = getMultiPaneNativeTestMarkup(placement, pubURL);
                break;
        }
        return callback(null, nativeTestMarkup, placement.defaultType);
    } else {
        // TODO: Wrapping in blanket try-catch is lazy, figure out lower
        // TODO: level errors & pass to callback directly
        var markup;
        try {
            switch (placement.defaultType){
                case 'passback':
                    markup = this.renderPassbackTag(placement.passbackTag, parent_tag_type);
                    break;
                case 'hostedCreative':
                    markup = this.renderHostedCreativeTag(placement, secure, parent_tag_type);
                    break;
                case 'hide':
                    // TODO: PLACEHOLDER
                    markup = '';
                    break;
                case 'psa':
                    // TODO: PLACEHOLDER
                    markup = '';
                    break;
                default:
                    markup = this.renderDefaultAdvertiserTag(bid_request, placement, secure);
                    break;
            }
            return callback(null, markup, placement.defaultType);
        } catch (e) {
            return callback(e, null, placement.defaultType);
        }
    }
};


// ##################################################################### //
// ################### DEFAULT OPTION TAG RENDERERS #################### //
// ##################################################################### //

// Functions to render markup to populate Pub Tag with, depending on what
// is selected for this placements' `defaultType`

/**
 * Placeholder for any passback tag manipulation that needs to be done
 * @param passbackTag
 * @param parent_tag_type
 */
DefaultConditionHandler.prototype.renderPassbackTag = function(passbackTag, parent_tag_type){
    var markup;
    if (parent_tag_type === 'iframe'){
        var fn = jade.compileFile('./templates/iframe_passback.jade', null);
        markup = fn({ passbackTag: passbackTag });
    } else {
        markup = passbackTag;
    }
    return markup;
};

/**
 * Renderer for Publisher Creative Tag, called when defaultType = 'hostedCreative'
 *
 * @param placement
 * @param secure
 * @param parent_tag_type
 * @returns {*}
 */
DefaultConditionHandler.prototype.renderHostedCreativeTag = function(placement, secure, parent_tag_type){
    var pubCrTag = new tags.PublisherHostedCreativeTag(this.impTagHostname, {
        secure_hostname: this.secureImpTagHostname,
        secure: secure,
        port: this.impTagPort,
        parent_tag_type: parent_tag_type
    });
    return pubCrTag.render(placement);
};

/**
 * TODO: OLD - TO BE DEPRECATED
 *
 * Serves impression tag from a randomly-selected default advertiser
 *
 * Default advertisers are set at the Clique level
 * @param bid_request
 * @param placement
 * @param secure
 * @returns {*}
 */
DefaultConditionHandler.prototype.renderDefaultAdvertiserTag = function(bid_request, placement, secure){
    // get Clique of placement from parent page or parent site, fall back on Outdoor
    var clique = placement.parent_page.clique || placement.parent_site.clique;
    clique = clique._id;

    // get list of advertisers who are designated as default_advertisers for this clique
    var advertisers = this.defaultAdvertisers[clique];

    // get matching creative group, chosen randomly from eligible creative groups
    var crg = this._chooseCreativeGroup(advertisers, placement);

    if (!crg){
        var dims = placement.w + 'x' + placement.h;
        var advertisers_str = advertisers.map(function(adv){ return adv.id });
        advertisers_str = advertisers_str.join(', ');
        throw Error('No default creative group with dimensions ' + dims + ' found in advertisers ' + advertisers_str);
    }

    // render impression tag
    var imptag = new tags.ImpTag(this.impTagHostname, {
        secure_hostname: this.secureImpTagHostname,
        secure: secure,
        port: this.impTagPort
    });
    var markup = imptag.render(crg);
    // expand macros to populate impId & placementId
    markup = urls.expandURLMacros(markup, { impid: bid_request.imp[0].id, pid: placement.id });
    return markup;
};

/**
 * TODO: Deprecate along with renderDefaultAdvertiserTag
 *
 * Chooses random creative group from list of default advertisers.  Only creative groups
 * with matching dimensions to placement will be considered.
 *
 * @param default_advertisers
 * @param placement
 * @returns {*}
 */
DefaultConditionHandler.prototype._chooseCreativeGroup = function(default_advertisers,placement){
    var crgs = [];
    default_advertisers.forEach(function(advertiser){
        advertiser.campaigns.forEach(function(campaign){
            campaign.creativegroups.forEach(function(creativegroup){
                if (creativegroup.h === placement.h && creativegroup.w === placement.w){
                    crgs.push(creativegroup);
                }
            });
        });
    });
    // Now choose random creative group from default creative groups available
    return crgs[Math.floor(Math.random()*crgs.length)];
};

exports.DefaultConditionHandler = DefaultConditionHandler;