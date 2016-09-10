const request = require('request');
const utils   = require('../utils');

let config = utils.getConfig();

module.exports.run = function(args) {
  if (utils.getToken() === null) {
    return utils.warning("You are not logged in.");
  }
  request.post(config.server + '/offline/logout', {
    form: {
      username: utils.getUsername(),
      clientToken: utils.getToken(),
      fingerprint: utils.fingerprint()
    }
  }, function(err, response, body) {
    if (err) {
      utils.error('RandomAPI servers are currently down. Please try again later.');
    } else {
      if (response.statusCode === 401) {
        utils.warning("An error occured while attempting to revoke the authToken...maybe it has already been revoked on RandomAPI?");
      } else if (response.statusCode === 404) {
        return utils.warning("Received unexpected response from server. Please verify server endpoint in ~/.randomapi.json");
      } else {
        utils.success('authToken revoked successfully!');
      }
      utils.success('You\'ve been logged out successfully!');
      
      utils.emptyDB(() => {
        utils.deleteFiles(() => {
          utils.setUsername(null);
          utils.setToken(null);
        })
      });
    }
  });
};
