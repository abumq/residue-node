'use strict';

try {
    module.exports = require('residue-native');
    module.exports = require('./lib/native');
} catch (e) {
    module.exports = require('./lib/residue');
}
