const ResidueClient = require('../');
const residue = new ResidueClient();
const fs = require('fs');

console.log('platform: ', process.platform);
console.log(`version: ${residue.version()} (${residue.type()})`);

if (process.platform === 'linux' || process.platform === 'darwin') {

  const getContents = () => fs.readFileSync('test/residue.log').toString('utf8');

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  const testLog = async (fn, msg) => {
    fn(msg);
    await sleep(1000);

    return getContents().indexOf(msg) !== -1;
  }

  const detailedTest = async () => {
      console.log('connecting...');

      residue.connect({
        url: '127.0.0.1:8777',
      });

      console.log('checking...');

      console.log(getContents());

      console.log('Creating logger');
      const logger = residue.getLogger('default');

      console.log('Sending messages');

      if (!await testLog(logger.info, 'info msg simple')) {
        console.log('info failed');
        console.log(getContents());
        process.exit(1);
      }

      if (!await testLog(logger.error, 'error msg simple')) {
        console.log('error failed');
        console.log(getContents());
        process.exit(1);
      }

      if (!await testLog(logger.debug, 'debug msg simple')) {
        console.log('debug failed');
        console.log(getContents());
        process.exit(1);
      }

      if (!await testLog(logger.trace, 'trace msg simple')) {
        console.log('trace failed');
        console.log(getContents());
        process.exit(1);
      }

      if (!await testLog(logger.warn, 'warn msg simple')) {
        console.log('warn failed');
        console.log(getContents());
        process.exit(1);
      }

      if (!await testLog(logger.fatal, 'fatal msg simple')) {
        console.log('fatal failed');
        console.log(getContents());
        process.exit(1);
      }

      // verbose manually
      logger.verbose(1, 'verbose msg simple');
      await sleep(1000);
      if (getContents().indexOf('verbose msg simple') === -1) {
        console.log('verbose failed');
        console.log(getContents());
        process.exit(1);
      }

      console.log(getContents());
      console.log('exiting - all tests OK');
      process.exit(0);
  }

  detailedTest();

}
