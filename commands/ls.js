const async = require('async');
const _     = require('lodash');
const Table = require('cli-table');
const utils = require('../utils');
let db = utils.getDB();

let config = utils.getConfig();

module.exports.run = function(args) {
  let apis, lists, requires;

  async.series([
    cb => db.api.find({}).sort({modified: -1}).exec((err, res) => {apis = res; cb();}),
    cb => db.list.find({}).sort({modified: -1}).exec((err, res) => {lists = res; cb();}),
    cb => db.require.find({}).sort({modified: -1}).exec((err, res) => {requires = res; cb();}),
  ], () => {
    console.log(`${apis.length} APIs available\n`);

    let apiTable = new Table({
      head: ['#', 'ref', 'name']
    });

    _.each(apis, (api, index) => {
      apiTable.push([index+1, api.ref, api.name]);
    });

    console.log(apiTable.toString());
  });
};
