var node_utils = require('@cliques/cliques-node-utils');
var tags = node_utils.tags;
var urls = node_utils.urls;

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
 * @param placement
 * @param secure
 * @param callback
 * @returns {*}
 */
DefaultConditionHandler.prototype.main = function(bid_request, placement, secure, callback){
    // default to false for secure
    secure = secure || false;
    var markup;
    // TODO: Wrapping in blanket try-catch is lazy, figure out lower
    // TODO: level errors & pass to callback directly
    try {
        switch (placement.defaultType){
            case 'passback':
                markup = this.renderPassbackTag(placement.passbackTag);
                break;
            case 'hostedCreative':
                markup = this.renderHostedCreativeTag(placement, secure);
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
        return callback(null, markup);
    } catch (e) {
        return callback(e);
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
 */
DefaultConditionHandler.prototype.renderPassbackTag = function(passbackTag){
    return passbackTag;
};

/**
 * Renderer for Publisher Creative Tag, called when defaultType = 'hostedCreative'
 *
 * @param placement
 * @param secure
 * @returns {*}
 */
DefaultConditionHandler.prototype.renderHostedCreativeTag = function(placement, secure){
    var pubCrTag = new tags.PublisherHostedCreativeTag(this.impTagHostname, {
        secure_hostname: this.secureImpTagHostname,
        secure: secure,
        port: this.impTagPort
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