const residue = require('../');
const fs = require('fs');

console.log(`version: ${residue.version()} (${residue.type()})`);


if (process.platform === 'linux' || process.platform === 'darwin--') {
    console.log('connecting...');

    residue.connect({
      url: '127.0.0.1:8777',
    });
  
    console.log('checking...');
    console.log(fs.readFileSync('/tmp/logs/residue.log').toString('utf8'));
    console.log('exiting');
    process.exit(0);
}
