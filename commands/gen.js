const utils   = require('../utils');
const request = require('request');
const async   = require('async');

let db     = utils.getDB();
let config = utils.getConfig();

module.exports.run = function(args) {
  if (utils.getToken() === null) {
    return utils.warning("You are not logged in.");
  }

  // Fetch API list
  let api = null;
  db.api.find({}).sort({modified: -1}).exec((err, res) => {
    // If user specifies number, assume they are choosing from list
    let num = Number(args[1]);
    if (Number.isInteger(num) && num <= res.length) {
      args[1] = res[num-1].ref;
    }

    request(`http://localhost:${utils.getConfig().port}/${args[1]}?${(args[2] || '').replace(/,/g,'&')}`, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        console.log(body);
      } else if (error) {
        utils.error(error);
      } else {
        utils.error("Malformed request");
      }
    });
  });
};
