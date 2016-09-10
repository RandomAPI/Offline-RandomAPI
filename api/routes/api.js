const express  = require('express');
const async    = require('async');
const router   = express.Router();
const spawn    = require('child_process').spawn;
const settings = require('../../utils').getConfig();
const db       = require('../../utils').getDB();

// Online check
router.get('/online', (req, res, next) => {
  res.sendStatus(200);
});

// Shutdown command
router.get('/shutdown', (req, res, next) => {
  res.send("OfflineAPI server is shutting down.");
  process.exit();
});

// Normal API processing
router.get('/:ref?', (req, res, next) => {
  const Generators = req.app.get('Generators');
  let api;

  async.series([
    // Check for hash
    cb => {
      if (req.params.ref !== undefined && req.params.ref.length === 32) {
        db.api.findAsync({hash: req.params.ref}).then(result => {
          if (result === null) return cb({code: 404, error: "INVALID_API_HASH"});

          api = result;
          req.params.ref = api.ref;
          req.query.hideuserinfo = true;

          cb(null);
        });
      } else {
        cb(null);
      }
    },
    cb => {
      let shortest = Math.floor(Math.random() * Generators.length);
      for (let i = 0; i < Generators.length; i++) {
        if (Generators[i].queueLength() <= Generators[shortest].queueLength() && Generators[i].generator.connected) {
          shortest = i;
        }
      }

      // Make sure generator isn't offline
      if (!Generators[shortest].generator.connected) {
        cb({code: 500, error: "GENERATOR_OFFLINE"});
      } else {
        if (isNaN(req.query.results) || req.query.results < 0 || req.query.results === '') req.query.results = 1;
        Generators[shortest].queue.push({req, res});
      }
    }
  ], (err, results) => {
    if (err) {
      res.status(err.code).send({error: err.error});
    }
  });
});

module.exports = router;
