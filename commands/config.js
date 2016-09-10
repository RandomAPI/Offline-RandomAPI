const path  = require('path');
const fs    = require('fs');
const utils = require('../utils');

module.exports.run = function(args) {
  let config = utils.getConfig();
  
  // View specific setting
  if (args.length === 2) {
    if (args[1] in config) {
      return console.log(`${args[1]}: ${config[args[1]]}`);
    } else {
      return console.log(`${args[1]} is not a valid property in configuration`);
    }

  // Set config value
  } else if (args.length === 3) {
    if (args[1] in config) {
      let old = config[args[1]];

      config[args[1]] = args[2];
      fs.writeFileSync(path.join(utils.getHome(), '.randomapi', 'config.json'), JSON.stringify(config, null, 2));

      return console.log(`${args[1]}: ${old} => ${args[2]}`);
    } else {
      return console.log(`${args[1]} is not a valid property in configuration`);
    }

  // Show entire config
  } else {
    console.log(config);
  }
};
