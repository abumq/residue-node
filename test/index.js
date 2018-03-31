const residue = require('../');
const fs = require('fs');

console.log(`version: ${residue.version()} (${residue.type()})`);

const getContents = () => fs.readFileSync('test/residue.log').toString('utf8');
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const testLog = async (fn, msg) => {
  const logger = residue.getLogger('default');

  fn(msg);
  await sleep(2000);

  return getContents().indexOf(msg) !== -1;
}
const detailedTest = async () => {
    if (process.platform === 'linux' || process.platform === 'darwin--') {
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

      console.log('exiting - all tests OK');
      console.log(getContents());
      process.exit(0);
  }
}

detailedTest();

