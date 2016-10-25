const path    = require('path');
const fs      = require('fs.extra');
const color   = require('colors');
const request = require('request');
const prompt  = require('prompt');
const utils   = require('../utils');
const pack    = require('../package.json');

let config = utils.getConfig();

module.exports.run = function(args) {
  if (utils.getToken() !== null) {
    return utils.warning(`You are already logged in as ${utils.getUsername()}. Please logout first.`);
  }
  var host;
  var username;
  var demo = false;

  prompt.message = pack.name;
  prompt.start();
  prompt.get([{
    name: 'username',
    required: true
  }, {
    name: 'authToken',
    required: true
  }], function (err, result) {
    if (err) return console.log('\n');
    username = result.username;
    request.post(config.server + '/offline/login', {
      form: {
        username: username,
        authToken: result.authToken,
        fingerprint: utils.fingerprint()
      }
    }, function(err, response, body) {
      if (err) {
        utils.error('RandomAPI servers are currently down. Please try again later.');
      } else {
        if (response.statusCode === 401) {
          let body = JSON.parse(response.body);
          if ('error' in body) {
            utils.error(JSON.parse(response.body).error);
          } else if ('warning' in body) {
            utils.warning(JSON.parse(response.body).warning);
          } else {
            utils.error("An unknown error has occured");
          }
        } else if (response.statusCode === 404) {
          utils.warning("Received unexpected response from server. Please verify server endpoint in ~/.randomapi.json");
        } else if (response.statusCode === 200) {
          utils.setUsername(username);
          utils.setToken(response.body);
          utils.success('Logged in successfully!');
        } else {
          utils.error("An unknown error has occured");
        }
      }
    });
  });
};
