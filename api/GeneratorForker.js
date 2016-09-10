'use strict'
const fork     = require('child_process').fork;
const util     = require('util');
const async    = require('async');
const _        = require('lodash');
const fs       = require('fs');
const random   = require('./utils').random;
const settings = require('../utils').getConfig();
const db       = require('../utils').getDB();

const EventEmitter = require('events').EventEmitter;

const GeneratorForker = function(options) {
  let self = this;

  this.info = {
    execTime: options.execTime,
    results:  options.results
  };

  this.silent       = false;
  this.name         = options.name;
  this.guid         = random(1, 8);
  this.startTime    = new Date().getTime();
  this.jobCount     = 0;
  this.memory       = 0;
  this.listCache    = 0;
  this.attempted    = false;
  this.snippetCache = 0;

  this.lastJobTime  = new Date().getTime();

  // Queue to push generate requests into
  this.initQueue();

  this.fork();

  // See if child process is alive during 5 second check
  setInterval(generatorChecks, 5000);

  function generatorChecks() {
    self.childReplied = false;
    setTimeout(() => {
      if (new Date().getTime()/1000 - self.lastReplied > 10 && !self.attempted) {
        self.generator = null;
        console.log(`[generator ${self.guid} ${self.name}]: Generator crashed...attempting to restart`);
        self.initQueue();
        self.guid = random(1, 8);
        self.fork();
        self.attempted = true;
      }
    }, 5000)
    try {
      self.send({type: 'ping'});
    } catch(e) {}
    self.once(`pong${self.guid}`, () => {
      self.lastReplied = new Date().getTime()/1000;
      self.attempted = false;
    });

    self.send({
      type: 'cmd',
      mode: 'getMemory'
    });

    var statTimeouts = setTimeout(() => {
      self.memory = 0;
      self.listCache = 0;
      self.snippetCache = 0;
    }, 10000);

    self.once(`memComplete${self.guid}`, data => {
      self.memory = Math.floor(data/1024/1024);
      clearTimeout(statTimeouts);
    });

    self.send({
      type: 'cmd',
      mode: 'getListCache'
    });

    self.once(`listCacheComplete${self.guid}`, data => {
      self.listCache = Math.floor(data/1024/1024);
      clearTimeout(statTimeouts);
    });

    self.send({
      type: 'cmd',
      mode: 'getSnippetCache'
    });

    self.once(`snippetCacheComplete${self.guid}`, data => {
      self.snippetCache = Math.floor(data/1024/1024);
      clearTimeout(statTimeouts);
    });

    if (
      new Date().getTime() - self.lastJobTime > self.info.execTime*1000 + 5000 &&
      self.queueLength() !== 0
    ) {
      console.log(`[generator ${self.name}]: Generator appears hung on task...attempting to purge queue`);
      self.killQueue();
    }
  }
};

util.inherits(GeneratorForker, EventEmitter);

GeneratorForker.prototype.fork = function() {
  let self = this;

  // Fork new Generator with provided info
  this.generator = fork(__dirname + '/Generator', [this.name, this.guid, JSON.stringify(this.info)], {silent: this.silent});

  // Handle all events
  // {type, mode, data}
  this.generator.on(`message`, msg => {

    if (msg.type === 'done') {
      this.emit(`taskFinished${this.guid}`, {error: msg.data.error, results: msg.data.results, fmt: msg.data.fmt});

    } else if (msg.type === 'cmdComplete') {
      if (msg.mode === 'memory') {
        this.emit(`memComplete${this.guid}`, msg.content);

      } else if (msg.mode === 'lists') {
        this.emit(`listsComplete${this.guid}`, msg.content);

      } else if (msg.mode === 'listCache') {
        this.emit(`listCacheComplete${this.guid}`, msg.content);

      } else if (msg.mode === 'snippetCache') {
        this.emit(`snippetCacheComplete${this.guid}`, msg.content);

      }

    } else if (msg.type === 'pong') {
      this.emit(`pong${this.guid}`);

    } else if (msg.type === 'ping') {
      this.send({
        type: 'pong'
      });
    }
  });
};

GeneratorForker.prototype.initQueue = function() {
  this.queue = async.queue((task, callback) => {
    this.jobCount++;
    this.lastJobTime  = new Date().getTime();

    let ref;
    if (task.req.params.ref === undefined) {
      ref = task.req.query.ref;
    } else {
      ref = task.req.params.ref;
    }
    _.merge(task.req.query, {ref});

    this.generate({mode: 'generate', options: task.req.query}, (error, results, fmt) => {
      if (fmt === 'json') {
        task.res.setHeader('Content-Type', 'application/json');
      } else if (fmt === 'xml') {
        task.res.setHeader('Content-Type', 'text/xml');
      } else if (fmt === 'yaml') {
        task.res.setHeader('Content-Type', 'text/x-yaml');
      } else if (fmt === 'csv') {
        task.res.setHeader('Content-Type', 'text/csv');
      } else {
        task.res.setHeader('Content-Type', 'text/plain');
      }
      if (error !== null) {
        if (error === "INVALID_API") {
          task.res.status(404).send({error});
        } else if (error === "UNAUTHORIZED_USER") {
          task.res.status(401).send({error});
        } else {
          task.res.status(403).send(error.formatted);
        }
      } else {
        task.res.status(200).send(results);
      }

      callback();
    });
  }, 1);
};

// Opts contains options and mode
GeneratorForker.prototype.generate = function(opts, cb) {

  // Send generator a new task using the given mode and options
  this.send({
    type: 'task',
    mode: opts.mode,
    data: opts.options
  });

  // Wait for the task to finish and then send err, results, and fmt to cb.
  this.once(`taskFinished${this.guid}`, data => {
    cb(data.error, data.results, data.fmt);
  });
};

// Get current task queue length
GeneratorForker.prototype.queueLength = function() {
  return this.queue.length();
};

GeneratorForker.prototype.killQueue = function() {
  this.queue.kill();
  this.initQueue();
};

GeneratorForker.prototype.totalJobs = function() {
  return this.jobCount;
};

GeneratorForker.prototype.memUsage = function() {
  return this.memory;
};

GeneratorForker.prototype.listCacheUsage = function() {
  return this.listCache;
};

GeneratorForker.prototype.snippetCacheUsage = function() {
  return this.listCache;
};

GeneratorForker.prototype.gc = function() {
  this.send({
    type: 'cmd',
    mode: 'gc'
  });
};

GeneratorForker.prototype.emptyListCache = function() {
  this.send({
    type: 'cmd',
    mode: 'emptyListCache'
  });
};

GeneratorForker.prototype.emptySnippetCache = function() {
  this.send({
    type: 'cmd',
    mode: 'emptySnippetCache'
  });
};

GeneratorForker.prototype.removeList = function(ref) {
  this.send({
    type: 'cmd',
    mode: 'removeList',
    data: ref
  });
};

GeneratorForker.prototype.removeSnippet = function(ref) {
  this.send({
    type: 'cmd',
    mode: 'removeSnippet',
    data: ref
  });
};

GeneratorForker.prototype.send = function(obj) {
  // Prevent crashes if the Generator is in the middle of restarting
  try {
    this.generator.send(obj);
  } catch(e) {}
}

module.exports = GeneratorForker;
