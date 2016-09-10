const express  = require('express');
const path     = require('path');
const http     = require('http');
const compress = require('compression');
const cors     = require('cors');
const debug    = require('debug')('OfflineAPI:server');
const app      = express();
const server   = http.createServer(app);
const _        = require('lodash');
const settings = require('../utils').getConfig();

// Initialize generators
const GeneratorForker = require('./GeneratorForker');
let Generators = {};

Generators = new Array(settings.generators.count).fill().map((k, v) => {
  return new GeneratorForker({
    name: "OfflineAPI",
    execTime: settings.generators.execTime,
    results: settings.generators.results
  });
});

// Store Generators in app
app.set("Generators", Generators);

// view engine setup
app.set('port', settings.port);

// CORS and GZIP
app.use(cors());
app.use(compress());

// Routes
app.use('/', require('./routes/api'));

// production error handler
// no stacktraces leaked to user
app.use((req, res, next) => res.sendStatus(404));
app.use((err, req, res, next) => {
  res.send(err.stack);
});

module.exports = {
  server,
  app
};
