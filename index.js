'use strict';

try {
  module.exports = require('residue-native');
  module.exports = require('./src/native');
} catch (e) {
  if (e.message.indexOf('Cannot find module \'residue-native\'') === -1) {
    // User is trying to use residue-native and getting error so we display
    // the error message
    console.log(e.message);
  }
  module.exports = require('./src/residue');
}
