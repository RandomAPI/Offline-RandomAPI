const mersenne     = new (require('mersenne-twister'));
const crypto       = require('crypto');
const YAML         = require('yamljs');
const js2xmlparser = require('js2xmlparser');
const converter    = require('json-2-csv');
const fs           = require('fs');
const vm           = require('vm');
const async        = require('async');
const util         = require('util');
const path         = require('path');
const _            = require('lodash');
const redis        = require('./utils').redis;
const numeral      = require('numeral')
const esprima      = require('esprima');
const Promise      = require('bluebird').Promise;
const EventEmitter = require('events').EventEmitter;

const utils        = require('../utils')
const settings     = utils.getConfig();
const db           = utils.getDB();

const Generator = function(name, guid, options) {
  this.version  = '0.1';
  this.name     = name || 'generator';
  this.guid     = guid;
  process.title = 'OfflineAPI_Generator ' + this.guid + ' ' + this.name;

  options      = JSON.parse(options);
  this.info    = {
    execTime: options.execTime,
    results:  options.results
  };

  this.cache        = {};
  this.snippetCache = {};
  this.times = {};
  this.globs = {};

  this.globRequires = ['faker', 'deity', 'moment'];
  this.configureGlobs();

  this.context         = vm.createContext(this.availableFuncs());
  this.originalContext = [
    'random', 'list', 'hash', 'timestamp',
    'require', '_APIgetVars', '_APIresults',
    '_APIstack', '_APIerror', 'getVar', 'stacktrace', 'prng'
  ];

  this.reservedObjects = {
    Array, Boolean, Date, decodeURI, decodeURIComponent, encodeURI,
    encodeURIComponent, Error, EvalError, Function, isFinite, isNaN,
    Math, Number, Object, parseInt, parseFloat, RangeError,
    ReferenceError, RegExp, String, SyntaxError, TypeError, URIError,
    JSON, Map, Promise, Proxy, Reflect, Set, Symbol, WeakMap, WeakSet,
    escape, unescape, ArrayBuffer, DataView, Float32Array,
    Float64Array, Int16Array, Int32Array, Int8Array, Uint16Array,
    Uint32Array, Uint8Array, Uint8ClampedArray
  };

  this.parentReplied = true;

  process.on(`message`, msg => {

    if (msg.type === 'task') {

      this.instruct(msg.data, error => {
        if (error) {
          process.send({type: 'done', data: {error, results: null, fmt: null}});
        } else {
          this.generate((error, results, fmt) => {
            process.send({type: 'done', data: {error, results, fmt}});
          });
        }
      });

    } else if (msg.type === 'cmd') {

      if (msg.mode === 'getMemory') {
        process.send({type: 'cmdComplete', mode: 'memory', content: process.memoryUsage().heapUsed});

      } else if (msg.mode === 'gc') {
        global.gc();

      } else if (msg.mode === 'emptyListCache') {
        this.emptyListCache();

      } else if (msg.mode === 'getListCache') {
        this.cacheSize = 0;
        _.each(this.cache, item => {
          this.cacheSize += Number(item.size);
        });
        process.send({type: 'cmdComplete', mode: 'listCache', content: this.cacheSize});

      } else if (msg.mode === 'emptySnippetCache') {
        this.emptySnippetCache();

      } else if (msg.mode === 'getSnippetCache') {
        this.snippetCacheSize = 0;
        _.each(this.snippetCache, item => {
          this.snippetCacheSize += Number(item.size);
        });
        process.send({type: 'cmdComplete', mode: 'snippetCache', content: this.snippetCacheSize});

      } else if (msg.mode === 'removeList') {
        let ref = msg.data;

        if (ref in this.cache) {
          // Update cache size and delete list from cache
          this.cacheSize -= this.cache[ref].size;
          delete this.cache[ref];
        }

        // Delete keys from Redis
        redis.del(`list:${ref}`)
        redis.del(`list:${ref}:contents`);

      } else if (msg.mode === 'removeSnippet') {
        let ref = msg.data;

        if (ref in this.snippetCache) {

          // Update cache size and delete list from cache
          this.snippetCacheSize -= this.snippetCache[ref].size;
          delete this.snippetCache[ref];
        }

        // Delete keys from Redis
        redis.del(`snippet:${ref}`)
        redis.del(`snippet:${ref}:contents`);
      }
    } else if (msg.type === 'pong') {
      this.emit(`pong${this.guid}`);

    } else if (msg.type === 'ping') {
      process.send({
        type: 'pong'
      });
    }
  });

  // Commit sudoku if parent process doesn't reply during 5 second check
  setInterval(() => {
    this.parentReplied = false;
    setTimeout(() => {
      if (!this.parentReplied) {
        process.exit();
      }
    }, 5000)
    try {
      process.send({type: 'ping'});
    } catch(e) {}
    this.once(`pong${this.guid}`, () => {
      this.parentReplied = true;
    });

    // See if any lists have expired or if over the max size limit
    this.checkCache();

    // See if any snippets have expired
    this.checkSnippetCache();
  }, 5000)
};

util.inherits(Generator, EventEmitter);

// Receives the query which contains API, owner, and reqest data
Generator.prototype.instruct = function(options, done) {
  this.times.instruct = {
    start: new Date().getTime()
  };

  this.options = options || {};
  this.results = Number(this.options.results);
  this.seed    = this.options.seed || '';
  this.format  = (this.options.format || this.options.fmt || 'json').toLowerCase();
  this.noInfo  = typeof this.options.noinfo !== 'undefined';
  this.sole    = typeof this.options.sole !== 'undefined' || typeof this.options.onlyone !== 'undefined';
  this.page    = Number(this.options.page) || 1;

  this.hideuserinfo = typeof this.options.hideuserinfo !== 'undefined';

  if (this.mode === undefined) this.mode = options.mode || "generator";

  // Sanitize values
  if (isNaN(this.results) || this.results < 0 || this.results > this.info.results || this.results === '' || this.sole) this.results = 1;
  if (this.seed === '') this.defaultSeed();
  if (this.page < 0 || this.page > 10000) this.page = 1;
  ///////////////////

  this.seedRNG();

  async.series([
    cb => {
      db.api.findAsync({ref: options.ref}).then(data => {
        this.doc = data[0];

        if (!this.doc) {
          cb('INVALID_API');
        } else {
          cb(null);
        }
      });
    },
    cb => {
      // Get API src
      fs.readFile(path.join(utils.getHome(), '.randomapi', 'data', 'api', `${this.doc.ref}.api`), 'utf8', (err, src) => {
        this.src = src;
        cb(null);
      });
    }
  ], (err, results) => {
    // Make sure user is populated with dummy user if no real user provided
    this.times.instruct = new Date().getTime() - this.times.instruct.start;
    done(err);
  });
};

Generator.prototype.generate = function(cb) {
  this.times.generate = {
    start: new Date().getTime()
  };

  this.results = this.results || 1;
  let output   = [];

  // Replaces requires with the src code so that they can run in sandbox
  this.updateRequires().then(() => {
    try {
      this.sandBox = new vm.Script(`
        'use strict'
        var _APIgetVars = ${JSON.stringify(_.defaults(this.options, {seed: this.seed, numericSeed: this.numericSeed}))};
        var _APIresults = [];
        var _APIlogs = [];
        var _APIerror = null;
        var _APIstack = null;
        var console = {
          log: (...args) => _APIlogs.push(...args)
        };
        (function() {
          for (var _APIi = 0; _APIi < ${this.results}; _APIi++) {
            var api = {};
            try {
${this.src}
            } catch (e) {
              api = {};
              _APIerror = e.toString();
              _APIstack = e.stack;
            }
            if (_APIlogs.length !== 0) {
              _APIresults.push({api, _APIlogs});
            } else {
              _APIresults.push(api);
            }
          }
        })();
        function getVar(key) {
          return key in _APIgetVars ? _APIgetVars[key] : null;
        }
        function _APIeval(src) {
          if (typeof src === "string") return eval(src);
          else return src
        }
      `);

      this.sandBox.runInContext(this.context, {
        displayErrors: true,
        timeout: this.info.execTime * 1000
      });

      if (this.context._APIerror === null && this.context._APIstack === null) {
        this.returnResults(null, this.context._APIresults, cb);
      } else {
        this.returnResults({error: this.context._APIerror, stack: this.context._APIstack}, [{}], cb);
      }
    } catch(e) {
      this.returnResults({error: e.toString(), stack: e.stack}, [{}], cb);
    }

    // Remove user defined globals
    let diff = Object.keys(this.context);
    diff.filter(each => this.originalContext.indexOf(each) === -1).forEach(each => delete this.context[each]);

    // Restore reservedObjects if tampered with
    _.each(this.reservedObjects, (object, val) => {
      const a = object;
      this.context[val] = a;
    });

    _.each({
      Array, Boolean, Date, decodeURI, decodeURIComponent, encodeURI,
      encodeURIComponent, Error, EvalError, Function, isFinite, isNaN,
      Math, Number, Object, parseInt, parseFloat, RangeError,
      ReferenceError, RegExp, String, SyntaxError, TypeError, URIError,
      JSON, Proxy, Reflect, Symbol, WeakMap, WeakSet,
      escape, unescape/**/
    }, (object, val) => {
      immutablify(this.context[val]);
    });

  }, e => {
    this.returnResults({error: e.toString(), stack: e.stack}, [{}], cb);
  });
};

Generator.prototype.seedRNG = function() {
  let seed = this.page !== 1 ? this.seed + String(this.page) : this.seed;

  this.numericSeed = parseInt(crypto.createHash('md5').update(seed).digest('hex').substring(0, 8), 16);
  mersenne.init_seed(this.numericSeed);
};

Generator.prototype.defaultSeed = function() {
  this.seed = random(1, 16);
};

Generator.prototype.availableFuncs = function() {
  let self = this;

  // Actual logic
  const funcs = {
    random: {
      numeric: (min = 1, max = 100) => {
        return range(min, max);
      },
      special: (mode, length) => {
        if (length > 65535) length = 1;
        return random(mode, length);
      },
      custom: (charset, length) => {
        if (length > 65535) length = 1;
        return random(-1, length, charset);
      }
    },
    list: (obj, num) => {
      if (this.mode === 'snippet') throw new Error(`Lists are not available in Snippets`);
      if (num !== '' && num !== undefined) num = Number(num); // Convert string to num if it isn't undefined
      if (num === '') num = undefined;
      if (obj === '' || obj === undefined) throw new Error(`Empty list value provided`);

      else if (Array.isArray(obj)) {
        if (num < 0 || num > obj.length-1) {
          throw new Error(`Index ${num} is out of range for array.`);
        } else {
          if (num !== undefined) {
            return obj[num];
          } else {
            return obj[range(0, obj.length-1)];
          }
        }
      } else if (typeof obj === "object") {
        let keys = Object.keys(obj);

        if (num < 0 || num > keys.length-1) {
          throw new Error(`Index ${num} is out of range for object.`);
        } else {
          if (num !== undefined) {
            return keys[num];
          } else {
            return keys[range(0, keys.length-1)];
          }
        }
      } else if (typeof obj === "string") {
        if (this.mode === 'snippet') throw new Error(`Lists are not available in Snippets; only inline lists are allowed`);
        // Check if list is in local generator list cache
        // If not, fetch from redis cache and add it to the local list cache
        if (obj in this.cache) {

          // Update local cache lastUsed date
          // Also update redis cache lastUsed date
          this.cache[obj].lastUsed = new Date().getTime();

          if (num !== undefined) {
            if (num < 1 || num > this.cache[obj].contents.length) {
              throw new Error(`Line ${num} is out of range for list ${obj}`);
            } else {
              item = this.cache[obj].contents[num-1];
            }
          } else {
            item = randomItem(this.cache[obj].contents);
          }
          return item;

        } else {

          let done = false;
          let item = null;

          db.list.findAsync({ref: obj}).then(doc => {
            doc = doc[0];

            fs.readFile(path.join(utils.getHome(), '.randomapi', 'data', 'list', `${doc.ref}.list`), 'utf8', (err, file) => {
              file = file.split('\n').slice(0, -1);

              // Fetch metadata for list and store in local generator cache
              this.cache[obj] = {
                added: new Date().getTime(),
                contents: file,
                size: 0,
                owner: 0,
                lastUsed: new Date().getTime(),
              };

              if (num !== undefined) {
                if (num < 1 || num > file.length) {
                  throw new Error(`Line ${num} is out of range for list ${obj}`);
                } else {
                  item = file[num-1];
                }
              } else {
                item = randomItem(file);
              }
              done = true;
            });
          });
          require('deasync').loopWhile(function(){return !done;});
          return item;
        }
      }
    },
    hash: {
      md5: val => {
        return crypto.createHash('md5').update(String(val)).digest('hex');
      },
      sha1: val => {
        return crypto.createHash('sha1').update(String(val)).digest('hex');
      },
      sha256: val => {
        return crypto.createHash('sha256').update(String(val)).digest('hex');
      }
    },
    timestamp: () => {
      return Math.floor(new Date().getTime()/1000);
    },
    stacktrace: () => {
      try {
        var obj = {};
        Error.captureStackTrace(obj, this.availableFuncs.a);

        let parseStack = obj.stack.toString().match(/evalmachine.*?:(\d+)(?::(\d+))?/);
        let line = parseStack[1]-14;
        let col  = parseStack[2];
        return `Stack trace called from line ${line}${col === undefined ? "." : " column " + col}`;
      } catch (e) {
        return 'Error calling stack trace';
      }
    },

    // Hardcoded native requires
    require: function(lib) {
      if (lib === undefined || lib.toString().length === 0) {
        throw new Error(`No snippet signature provided`);
        return;
      }

      lib = lib.toString().trim();
      if (lib === undefined || lib.length === 0) throw new Error(`No snippet signature provided`);

      // Make sure valid glob
      if (self.globRequires.indexOf(lib) !== -1) {

        switch(lib) {
          case 'faker':
            // Reset faker back to en locale
            self.globs.faker.locale = 'en';
            self.globs.faker.seed(Math.floor(self.numericSeed*prng())%2147483648);
            break;
          case 'deity':
            break;
          case 'moment':
            self.globs.moment.locale('en');
            break;
        };
        return self.globs[lib];
      } else {
        return self.require(lib);
      }
    }
  };

  // Proxy to hide logic
  const proxy =  {
    random: {
      numeric: (min, max)       => funcs.random.numeric(min, max),
      special: (mode, length)   => funcs.random.special(mode, length),
      custom: (charset, length) => funcs.random.custom(charset, length)
    },
    list: (obj, num) => funcs.list(obj, num),
    hash: {
      md5: val    => funcs.hash.md5(val),
      sha1: val   => funcs.hash.sha1(val),
      sha256: val => funcs.hash.sha256(val)
    },
    timestamp: () => funcs.timestamp(),
    stacktrace: () => funcs.stacktrace(),
    require: lib => funcs.require(lib),
    prng
  };

  _.each(proxy, object => {
    immutablify(object);
  });

  return proxy;
};

Generator.prototype.require = function(signature) {
  if (signature === undefined || signature.length === 0) {
    throw new Error(`No snippet signature provided`);
    return undefined;
  }

  if (signature.indexOf('~') === 0) {
    signature = utils.getUsername() + '/' + signature.slice(1);
  }

  let tmp = signature.split('/');

  // No version supplied
  if (tmp.length === 2) {
    obj = {username: tmp[0], name: tmp[1]};
  } else {
    obj = {username: tmp[0], name: tmp[1], version: Number(tmp[2])};
  }

  // Check if snippet is in local snippet cache
  if (signature in this.snippetCache) {
    // Update local snippet cache lastUsed date
    this.snippetCache[signature].lastUsed = new Date().getTime();
    return this.snippetCache[signature].snippet;
  } else {

    let done = false;
    let contents = null;

    db.require.findAsync(obj).then(doc => {
      if (doc.length === 0) {
        done = true;
        contents = {text: `Snippet signature ${signature} wasn't recognized`};
        return;
      }
      doc = doc[0];

      fs.readFile(path.join(utils.getHome(), '.randomapi', 'data', 'require', `${doc.ref}-${doc.version}.snippet`), 'utf8', (err, snippet) => {
snippet = `(function() {
  let snippet = {};
  ${snippet}
  return snippet;
})()`;

        this.snippetCache[signature] = {
          added: new Date().getTime(),
          snippet,
          size: 0,
          owner: 0,
          published: 1,
          lastUsed: new Date().getTime()
        };

        contents = snippet;
        done = true;
      });
    });
    require('deasync').loopWhile(function(){return !done;});
    if (typeof contents === "object") {
      throw new Error(contents.text);
    }
    return contents;
  }
};

Generator.prototype.checkCache = function() {
  let sizes = {};
  _.each(this.cache, (obj, ref) => {
    sizes[ref] = obj.size;
    if (new Date().getTime() - obj.lastUsed > settings.generators.localTTL * 1000) {
      delete this.cache[ref];
    }
  });

  sizes = _.toPairs(sizes);
  sizes.sort((a, b) => ~~b[1] - ~~a[1]);

  while (this.cacheSize > settings.generators.localCache * 1024 * 1024) {
    let toRemove = sizes.shift();
    delete this.cache[toRemove[0]];
    this.cacheSize -= toRemove[1];
  }
};

Generator.prototype.checkSnippetCache = function() {
  let sizes = {};

  _.each(this.snippetCache, (obj, ref) => {
    if (new Date().getTime() - obj.lastUsed > settings.generators.localSnippetTTL * 1000) {
      delete this.cache[ref];
    }
  });
};

Generator.prototype.emptyListCache = function() {
  this.cache = {};
};

Generator.prototype.emptySnippetCache = function() {
  this.snippetCache = {};
};

// Only global snippets can be required in other snippets
Generator.prototype.updateRequires = function() {
  let self = this;

  return new Promise((resolve, reject) => {
    let requireCount = 0;
    esprima.parse(this.src, {comment: true, range: true}, (node, meta) => {
      if (node.type === "CallExpression" && node.callee.name === "require" && self.globRequires.indexOf(node.arguments[0].value) === -1) {
        this.src = this.src.slice(0, node.range[0]+requireCount*10) + "_APIeval(" + this.src.slice(node.range[0]+requireCount*10, node.range[1]+requireCount*10) + ")" + this.src.slice(node.range[1]+requireCount*10);
        requireCount++;
      }
    });
    resolve();
  });
};

Generator.prototype.returnResults = function(err, output, cb) {
  this.times.generate = new Date().getTime() - this.times.generate.start;
  if (err === null) {
    let json = {
      results: output,
      info: {
        seed: String(this.seed),
        results: numeral(this.results).format('0,0'),
        page: numeral(this.page).format('0,0'),
        version: this.version,
        time: this.times
      }
    };

    if (this.noInfo) delete json.info;
    if (this.hideuserinfo && !this.noInfo) delete json.info.user;
    if (this.sole) json.results = json.results[0];

    if (this.format === 'yaml') {
      cb(null, YAML.stringify(json, 4), 'yaml');
    } else if (this.format === 'xml') {
      cb(null, js2xmlparser('user', json), 'xml');
    } else if (this.format === 'prettyjson' || this.format === 'pretty') {
      cb(null, JSON.stringify(json, null, 2), 'json');
    } else if (this.format === 'csv') {
      converter.json2csv(json.results, (err, csv) => {
        cb(null, csv, 'csv');
      });
    } else if (this.format === 'raw') {
      cb(null, json.results, 'txt');
    } else if (this.format === 'prettyraw') {
      cb(null, JSON.stringify(json.results, null, 2), 'json');
    } else {
      cb(null, JSON.stringify(json), 'json');
    }
  } else {
    // Errors caused by code wrapped around broken api code
    // which is basically unexpected end of input and more clear
    // to the user
    if ([
      "SyntaxError: Unexpected token }",
      "SyntaxError: Unexpected token catch",
      "SyntaxError: Unexpected token var",
      "SyntaxError: Missing catch or finally after try"
    ].indexOf(err.error) !== -1) {
      err.error = "SyntaxError: Unexpected end of input";
    }

    // Attempt to extract line/col number of error
    try {
      parseStack = err.stack.split('\n').slice(0, 2).join('').match(/evalmachine.*?:(\d+)(?::(\d+))?/);
      let line = parseStack[1]-14;
      let col  = parseStack[2];
      if (line < 0) {
        err.error = "SyntaxError: Unexpected end of input";
      }

      parseStack = `${err.error.toString().split(':').join(':\n-')} near line ${line}${col === undefined ? "." : " column " + col}`;
    } catch(e) {
      parseStack = err.error;
    }
    err.formatted = parseStack;
    delete err.stack;
    cb(err, JSON.stringify({results: [{}]}), null);
  }
}

Generator.prototype.configureGlobs = function() {
  // Make sure valid glob
  this.globRequires.forEach(lib => {
    switch(lib) {
      case 'faker':
        // Only allow locale to changed
        this.globs.faker = require('faker');
        this.globs.faker.seed(this.numericSeed);
        immutablify(this.globs.faker, {seal: [], writable: ['locale', 'seedValue']});
        break;
      case 'deity':
        this.globs.deity = require('deity');
        immutablify(this.globs.deity, {seal: [], writable: ['locale']});
        break;
      case 'moment':
        this.globs.moment = require('moment');
        immutablify(this.globs.moment, {seal: [], writable: []});
        break;
    };
  });
}

const random = (mode = 1, length = 10, charset = "") => {
  if (!Number.isInteger(mode) || !Number.isInteger(length)) throw new TypeError('Non numeric arguments provided');

  let result = '';
  let chars;

  if (mode === 1) {
    chars = 'abcdef1234567890';
  } else if (mode === 2) {
    chars = 'ABCDEF1234567890';
  } else if (mode === 3) {
    chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
  } else if (mode === 4) {
    chars = '0123456789';
  } else if (mode === 5) {
    chars = 'abcdefghijklmnopqrstuvwxyz';
  } else if (mode === 6) {
    chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  } else if (mode === 7) {
    chars = 'abcdefghijklmnopqrstuvwxyz1234567890';
  } else if (mode === 8) {
    chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
  } else if (mode === -1) {
    if ((typeof charset !== 'string' && !(charset instanceof String)) || charset.length === 0) throw new TypeError('Provided charset is invalid');
    chars = charset;
  }

  for (let i = 0; i < length; i++) {
      result += chars[range(0, chars.length - 1)];
  }

  return result;
};

const randomItem = arr => {
  return arr[range(0, arr.length-1)];
};

const range = (min, max) => {
  if (!Number.isInteger(min) || !Number.isInteger(max)) throw new TypeError('Non numeric arguments provided');
  if (max < min) throw new RangeError('min is greater than max');
  return Math.floor(mersenne.random() * (max - min + 1)) + min;
};

function prng() {
  return mersenne.random();
}

function immutablify(obj, exclude={seal: [], writable: []}, depth=0) {
  if (typeof obj !== "object" && depth !== 0 || obj === null) return;

  Object.getOwnPropertyNames(obj).forEach(prop => {

    // Not in exclusion list
    if (exclude.seal.indexOf(prop) === -1) {
      Object.seal(obj[prop]);
    }

    if (exclude.writable.indexOf(prop) === -1) {
      try {
        Object.defineProperty(obj, prop, {writable: false});
      } catch(e) {}
    }

    immutablify(obj[prop], exclude, ++depth); // Recursively run on props of props
  });
  Object.seal(obj); // seal self
}

new Generator(process.argv[2], process.argv[3], process.argv[4]);
