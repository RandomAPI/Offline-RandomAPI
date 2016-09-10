const utils = require('../utils');

module.exports.run = function(args) {
  utils.checkServer(res => {
    if (res) {
      utils.success("Server is online!");
    } else {
      utils.error("Server is offline!");
    }
  });
};
