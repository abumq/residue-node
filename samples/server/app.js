//
// 1. Run: node app.js
// 2. On browser open http://localhost:3009
//

var express = require('express');

var residue = require('residue');
var logger = residue.getLogger('sample-app');
var defaultLogger = residue.getLogger('default');


console.log(`Residue lib version v${residue.version()}`);

var app = express();

app.get('*', function(req, res, next) {
    return next();
});

function namedFunc() {
    logger.debug('this is from named func');
    logger.error('resitail can format your templates');
}

app.get('/sample-app', function (req, res) {
    logger.info('using sample-app \'wow\'  logger');
    res.send('Hello sample-app logger!');
});

app.get('/default', function (req, res) {
	defaultLogger.info('using default logger');
    res.send('Hello default logger!');
});

app.get('/', function (req, res) {
	//defaultLogger.info('info default logger');
	//defaultLogger.verbose(3, 'verbose using default logger');
    logger.info('%s this is best %d:%s', [1, 2, 3], 123, "test");
    //namedFunc();
    res.send('Hello World!');
});

app.listen(3009, function () {
    console.log('Open http://localhost:3009 on browser');

    const confFile = 'client.conf.json';
    if (residue.loadConfiguration(confFile)) {
        residue.connect();
    }
    // alternatively you could do residue.connect(config_json_object)
});
