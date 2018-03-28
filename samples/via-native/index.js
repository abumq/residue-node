const residue = require('residue');
const logger = residue.getLogger('sample-app');

console.log(`Library version: ${residue.version()}-${residue.type()}`);

const confFile = 'client.conf.json';
if (residue.loadConfiguration(confFile)) {
    residue.connect();
}

logger.info('simple log');

logger.info('array %s', [1, 2, 3]);

var person = { 'name': 'Adam', 'age': 960, }
logger.info('obj %s', person);

logger.info('null %s', null);

logger.info('undefined %s', undefined);

