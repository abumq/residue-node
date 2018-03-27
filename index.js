'use strict';

try {
    module.exports = require('./src/residue-native');
} catch (e) {
    console.log('Falling back to residue JS library. Could not link to libresidue. (Make sure LD_LIBRARY_PATH is set)');
    module.exports = require('./src/residue');
}
