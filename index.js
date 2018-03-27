'use strict';

try {
    module.exports = require('residue-native');
    module.exports = require('./src/native');
} catch (e) {
    module.exports = require('./src/residue');
}
