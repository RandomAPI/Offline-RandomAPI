const moment   = require('moment');
const _        = require('lodash');
const fs       = require('fs');
const settings = require('../utils').getConfig();

module.exports = {
  random(mode, length) {
    let result = '';
    let chars;

    if (mode === 1) {
      chars = 'abcdef1234567890';
    } else if (mode === 2) {
      chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
    } else if (mode === 3) {
      chars = '0123456789';
    } else if (mode === 4) {
      chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    } else if (mode === 5) {
      chars = 'abcdefghijklmnopqrstuvwxyz1234567890';
    } else if (mode === 6) {
      chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
    }

    for (let i = 0; i < length; i++) {
      result += chars[module.exports.range(0, chars.length - 1)];
    }

    return result;
  },
  range(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },
  settings
};
