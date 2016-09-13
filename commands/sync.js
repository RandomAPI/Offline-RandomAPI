const fs      = require('fs');
const request = require('request');
const async   = require('async');
const utils   = require('../utils');
const util    = require('util');
const path    = require('path');

let db = utils.getDB();
let config = utils.getConfig();

module.exports.run = function(args) {
  if (utils.getToken() === null) {
    return utils.warning("You are not logged in.");
  }
  request.post(config.server + '/offline/sync', {
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
        utils.error("Invalid token!");
      } else if (response.statusCode === 404) {
        utils.warning("Received unexpected response from server. Please verify server endpoint in ~/.randomapi.json");
      } else {
        utils.emptyDB(() => {
          utils.deleteFiles(() => {
            body = JSON.parse(body);
          console.log(
`Sync information
Remote APIs:     ${body.apis.length}\t${body.apiSize}
Remote Snippets: ${body.requires.length}\t${body.requireSize}
Remote Lists:    ${body.lists.length}\t${body.listSize}\n`);

            async.series([
              cb => {
                console.log("Syncing APIs...");
                async.each(body.apis, (api, callback) => {
                  db.api.insertAsync(api).then(() => {
                    let fstream = fs.createWriteStream(path.join(utils.getHome(), '.randomapi', 'data', 'api', `${api.ref}.api`));
                    fstream.on('close', function() {
                      callback();
                    });
                    request.post(`${config.server}/offline/download/api/${api.ref}`, {
                      form: {
                        username: utils.getUsername(),
                        clientToken: utils.getToken(),
                        fingerprint: utils.fingerprint()
                      }
                    }).pipe(fstream);
                  });
                }, () => cb());
              },
              cb => {
                console.log("Syncing Snippets...");
                async.each(body.requires, (require, callback) => {
                  db.require.insertAsync(require).then(() => {
                    let fstream = fs.createWriteStream(path.join(utils.getHome(), '.randomapi', 'data', 'require', `${require.ref}-${require.version}.snippet`));
                    fstream.on('close', function() {
                      callback();
                    });
                    request.post(`${config.server}/offline/download/require/${require.ref}-${require.snippetID}-${require.version}`, {
                      form: {
                        username: utils.getUsername(),
                        clientToken: utils.getToken(),
                        fingerprint: utils.fingerprint()
                      }
                    }).pipe(fstream);
                  });
                }, () => cb());
              },
              cb => {
                console.log("Syncing Lists...");
                async.each(body.lists, (list, callback) => {
                  db.list.insertAsync(list).then(() => {
                    let fstream = fs.createWriteStream(path.join(utils.getHome(), '.randomapi', 'data', 'list', `${list.ref}.list`));
                    fstream.on('close', function() {
                      callback();
                    });
                    request.post(`${config.server}/offline/download/list/${list.ref}`, {
                      form: {
                        username: utils.getUsername(),
                        clientToken: utils.getToken(),
                        fingerprint: utils.fingerprint()
                      }
                    }).pipe(fstream);
                  });
                }, () => cb());
              }
            ], () => {
              console.log('\nSync finished...restarting OfflineAPI server.');
              utils.restart();
            });
          });
        });
      }
    }
  });
};
