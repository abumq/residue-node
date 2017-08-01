//
// 1. Run: node app.js
// 2. On browser open http://localhost:3009
//

var express = require('express');

var residue = require('residue');
var logger = residue.getLogger('sample-app');
var defaultLogger = residue.getLogger('default');

var app = express();

/*
const residueParams = {
    url: "localhost:8777",
    access_codes: [
        {
            logger_id: "sample-app",
            code: "a2dcb"
        }
    ],
    application_id: "com.muflihun.securitybox",    
    rsa_key_size: 2048,
    utc_time: true,
    time_offset: 0,
    client_id: "muflihun00102030",
    client_private_key: "/Users/majid.khan/Projects/residue/samples/clients/netcat/client-256-private.pem",
    server_public_key: "/Users/majid.khan/Projects/residue/samples/clients/netcat/server-1024-public.pem"
};
*/

app.get('*', function(req, res, next) {
    //logger.info('Request: ' + req.url);
    return next();
});

function namedFunc() {
    logger.info('this is from named func');
}

app.get('/blah', function (req, res) {
	logger.info('using sample-app logger');
    defaultLogger.info('using default logger');
    res.send('Hello Blah!');
});

app.get('/', function (req, res) {
	defaultLogger.info('using default logger');
    namedFunc();
    res.send('Hello World!');
});

app.listen(3009, function () {
    console.log('Open http://localhost:3009 on browser');

    // Either you can use residueParams or loadConfiguration form file
    // for this sample we use loadConfiguration
	const confFile = 'client.conf.json';
    if (residue.loadConfiguration(confFile)) {
        residue.connect(/*residueParams*/);
    }
});
