const request = require('request');
const utils   = require('../utils');

let config = utils.getConfig();

module.exports.run = function(args) {
  require(utils.lodir('./commands/ls')).run();
};
