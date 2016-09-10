const fs        = require('fs.extra');
const color     = require('colors');
const os        = require('os');
const path      = require('path');
const crypto    = require('crypto');
const async     = require('async');
const request   = require('request');
const spawn     = require('child_process').spawn;
const _         = require('lodash');
const bluebird  = require('bluebird');
const rimraf    = require('rimraf');
const Datastore = require('nedb');
bluebird.promisifyAll(Datastore.prototype);

let db = {};

let getHome = () => process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];

let lodir = (...dir) => {
  let newArgs = [__dirname].concat(dir);
  return path.join(...newArgs);
};

let loadDB = () => {
  try {
    fs.mkdirSync(path.join(getHome(), '.randomapi'));
    fs.mkdirSync(path.join(getHome(), '.randomapi', 'db'));
    fs.mkdirSync(path.join(getHome(), '.randomapi', 'data'));
    fs.mkdirSync(path.join(getHome(), '.randomapi', 'data', 'api'));
    fs.mkdirSync(path.join(getHome(), '.randomapi', 'data', 'list'));
    fs.mkdirSync(path.join(getHome(), '.randomapi', 'data', 'require'));
  } catch(e) {}
  db.api     = new Datastore({filename: path.join(getHome(), '.randomapi', 'db', 'api.db'), autoload: true});
  db.list    = new Datastore({filename: path.join(getHome(), '.randomapi', 'db', 'list.db'), autoload: true});
  db.require = new Datastore({filename: path.join(getHome(), '.randomapi', 'db', 'require.db'), autoload: true});
}

let emptyDB = done => {
    db.api.removeAsync({}, { multi: true })
    .then(db.list.removeAsync({}, { multi: true }))
    .then(db.require.removeAsync({}, { multi: true }))
    .then(done);
};

let deleteFiles = done => {
  async.series([
    cb => rimraf(path.join(getHome(), '.randomapi', 'data', 'api', '*'), cb),
    cb => rimraf(path.join(getHome(), '.randomapi', 'data', 'list', '*'), cb),
    cb => rimraf(path.join(getHome(), '.randomapi', 'data', 'require', '*'), cb)
    ], done);
};

let getConfig = () => {
  let config;
  try {
    config = JSON.parse(fs.readFileSync(path.join(getHome(), '.randomapi', 'config.json')));
  } catch (e) {
    config = require(lodir('./config.json'));
    fs.writeFileSync(path.join(getHome(), '.randomapi', 'config.json'), JSON.stringify(config, null, 2));
  }
  return config;
};

let getUsername = () => getConfig().username;

let setUsername = username => {
  let config = JSON.parse(fs.readFileSync(path.join(getHome(), '.randomapi', 'config.json')));
  config.username = username;
  fs.writeFileSync(path.join(getHome(), '.randomapi', 'config.json'), JSON.stringify(config, null, 2));
};

let getToken = () => getConfig().clientToken;

let setToken = clientToken => {
  let config = JSON.parse(fs.readFileSync(path.join(getHome(), '.randomapi', 'config.json')));
  config.clientToken = clientToken;
  fs.writeFileSync(path.join(getHome(), '.randomapi', 'config.json'), JSON.stringify(config, null, 2));
};

let warning = txt => console.log(color.yellow(txt));
let error   = txt => console.log(color.red(txt));
let success = txt => console.log(color.green(txt));

let fingerprint = () => {
  try {
    let fingerprint = JSON.stringify({
      eol: os.EOL,
      arch: os.arch(),
      constants: os.constants,
      home: os.homedir(),
      platform: os.platform(),
      type: os.type()
    });

    return crypto.createHash('sha256').update(fingerprint).digest('hex');
  } catch(e) {
    return null;
  }
};


let getDB = () => db;

let stopServer = () => {
  request(`http://localhost:${getConfig().port}/shutdown`, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      success("Shutting down OfflineAPI Server.");
    } else {
      warning("No response received from server...maybe it is already shutdown?");
    }
  });
};

let checkServer = cb => {
  request(`http://localhost:${getConfig().port}/online`, function (error, response, body) {
    cb(!error && response.statusCode == 200);
  });
};

let startServer = () => {
  checkServer(res => {
    if (res) {
      warning("Server appears to be online already.");
    } else {
      spawn('node', [lodir('api', 'server')]);
      success(`Starting OfflineAPI Server on port ${getConfig().port}.`);
    }
  });
};

loadDB();
module.exports.lodir       = lodir;
module.exports.getDB       = getDB;
module.exports.loadDB      = loadDB;
module.exports.deleteFiles = deleteFiles;
module.exports.emptyDB     = emptyDB;
module.exports.getConfig   = getConfig;
module.exports.getUsername = getUsername;
module.exports.setUsername = setUsername;
module.exports.getToken    = getToken;
module.exports.setToken    = setToken;
module.exports.getHome     = getHome;
module.exports.warning     = warning;
module.exports.error       = error;
module.exports.success     = success;
module.exports.fingerprint = fingerprint;
module.exports.startServer = startServer;
module.exports.stopServer  = stopServer;
module.exports.checkServer = checkServer;
