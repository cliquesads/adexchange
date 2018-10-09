/**
 * Creates all BigQuery tables defined by bg_config.json
 */

const config = require('config');
const node_utils = require('@cliques/cliques-node-utils');
const bigQueryUtils = node_utils.google.bigQueryUtils;
const async = require('async');
const googleAuth = node_utils.google.auth;

googleAuth.getJWTAuthClient(googleAuth.DEFAULT_JWT_SECRETS_FILE, [bigQueryUtils.BIGQUERY_SCOPE], function(err, auth){
    const adEventDataset = config.get("Exchange.logger.bigQuery.adEventDataset");
    const httpEventDataset = config.get("Exchange.logger.bigQuery.httpEventDataset");
    const tableConfig = bigQueryUtils.loadFullBigQueryConfig('./bq_config.json', httpEventDataset, adEventDataset);
    const functions = [];
    for (let table of Object.entries(tableConfig.event_tables)){
        let tableName = table[0];
        if (tableName !== 'HTTP-REQUEST' && tableName !== 'HTTP-RESPONSE'){
            functions.push(function(callback){
                bigQueryUtils.createBigQueryTableFromConfig(auth, tableConfig, tableName , function(err, response){
                    if (err) {
                        console.log(err);
                        callback(err);
                    }
                    console.log(response);
                    callback(null, response);
                });
            })
        }
    }
    async.parallel(functions, function(err, results){
        if (err){
            console.error(err);
            return process.exit(1);
        }
        return process.exit(0);
    })
});