//
// 1. Run: node app.js
// 2. On browser open http://localhost:3009
//

var express = require('express');

var residue = require('residue');
var logger = residue.getLogger('sample-app');

var app = express();

var residueParams = {
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

app.get('*', function(req, res, next) {
    logger.info('Request: ' + req.url);
    return next();
});

app.get('/', function (req, res) {
    logger.info('Another log');
    logger.info('Info Hello World!');
    res.send('Hello World!');
});

app.listen(3009, function () {
    console.log('Open http://localhost:3009 on browser');

    residue.connect(residueParams);
});
