//
// Official Node.js client library for Residue logging server
//
// Copyright 2017-present Muflihun Labs
//
// This module provides interface for connecting and interacting with
// residue server seamlessly. Once you are connected this module
// takes care of lost connections, expired tokens, expired clients
// and keep itself updated with latest tokens and touch server when 
// needed to stay alive.
//
// Author: @abumusamq
//
// https://muflihun.com
// https://muflihun.github.io/residue
// https://github.com/muflihun/residue-node
//

"use strict"; 

const fs = require('fs');
const path = require('path');
const net = require('net');
const util = require('util');
const zlib = require('zlib');
const NodeRSA = require('node-rsa');
let crypto;
try {
    crypto = require('crypto');
} catch (err) {
    console.log('residue package requires crypto (https://nodejs.org/api/crypto.html). It is disabled in your version of node!');
}

const Params = {
    // user provided options for seamless connection
    //   app, host, connect_port, access_codes
    options: {},

    // connecting object containing:
    //   client_id, age, date_created, key, logging_port, token_port
    connection: null,

    // rsa_key is keypair object
    rsa_key: null,

    // server_rsa_key is keypair object
    server_rsa_key: null,

    // whether connected to the server or not
    connected: false,

    // list of tokens currently available
    tokens: [],

    // Underlying sockets
    connection_socket: new net.Socket(),
    token_socket: new net.Socket(),
    logging_socket: new net.Socket(),

    // Debug logging
    debugging: false,
    verboseLevel: 0,

    // Status for sockets
    token_socket_connected: false,
    logging_socket_connected: false,

    // callbacks on specific occasions
    send_request_backlog_callbacks: [],
    logging_socket_callbacks: [],
    token_socket_callbacks: [],
    
    // locks for mutex
    locks: {},
    
    token_request_queue: [],
};

Params.locks[Params.connection_socket.address().port] = false;
Params.locks[Params.token_socket.address().port] = false;
Params.locks[Params.logging_socket.address().port] = false;


// Various connection types accepted by the server
const ConnectType = {
    Connect: 1,
    Acknowledgement: 2,
    Touch: 3
};

// Various logging levels accepted by the server
const LoggingLevels = {
  Trace: 2,
  Debug: 4,
  Fatal: 8,
  Error: 16,
  Warning: 32,
  Verbose: 64,
  Info: 128
};

const Flag = {
  NONE: 0,
  ALLOW_UNKNOWN_LOGGERS: 1,
  REQUIRES_TOKEN: 2,
  ALLOW_DEFAULT_ACCESS_CODE: 4,
  ALLOW_PLAIN_LOG_REQUEST: 8,
  ALLOW_BULK_LOG_REQUEST: 16,
  COMPRESSION: 256
};

const PACKET_DELIMITER = '\r\n\r\n';
const DEFAULT_ACCESS_CODE = 'default';
const TOUCH_THRESHOLD = 60; // should always be min(client_age) - max(client_age/2)

// Utility static functions
const Utils = {
    log: (m) => console.log(m),

    debugLog: (m) => {
        if (Params.debugging) {
            console.log(m);
        }
    },

    traceLog: (m) => Utils.debugLog(`TRACE: ${m}`),

    vLog: (l, m) => {
        if (Params.debugging && l <= Params.verboseLevel) {
            console.log(m);
        }
    },

    hasFlag: (f) => {
        if (Params.connection === null) {
            return false;
        }
        return (Params.connection.flags & f) !== 0;
    },

    // Encode Base64
    base64Encode: (str) => new Buffer(str).toString('base64'),

    base64Decode: (encoded) => new Buffer(encoded, 'base64').toString('utf-8'),

    // Get current date in microseconds
    now: () => parseInt((new Date()).getTime() / 1000, 10),

    getTimestamp: () => Utils.now(),

    // Send request to the server
    // This function decides whether to back-log the request or dispatch it to
    // the server
    sendRequest: (request, socket, nolock /* = false */, sendPlain /* = false */, compress /* = false */) => {
        if (typeof nolock === 'undefined') {
            nolock = false;
        }
        if (typeof sendPlain === 'undefined') {
            sendPlain = false;
        }
        if (typeof compress === 'undefined') {
            compress = false;
        }
        if (!nolock && Params.locks[socket.address().port]) {
            Params.send_request_backlog_callbacks.push(function() {
                Utils.debugLog('Sending request via callback');
                Utils.sendRequest(request, socket, false, sendPlain, compress);
            });
            return;
        }
        let finalRequest = JSON.stringify(request);
        if (compress) {
            finalRequest = new Buffer(zlib.deflateSync(finalRequest)).toString('base64');
        }
        let encryptedRequest;
        if (!sendPlain) {
            encryptedRequest = Utils.encrypt(finalRequest);
        } else {
            encryptedRequest = finalRequest + PACKET_DELIMITER;
        }
        Utils.vLog(9, 'Payload (Plain): ' + encryptedRequest);
        Utils.vLog(8, 'Locking ' + socket.address().port);
        Params.locks[socket.address().port] = true;
        try {
            Utils.debugLog('Sending...');
            socket.write(encryptedRequest, 'utf-8', function() {
                Params.locks[socket.address().port] = false;
                Utils.vLog(8, 'Unlocking ' + socket.address().port);
                setTimeout(function() {
                    if (Params.send_request_backlog_callbacks.length > 0) {
                        const cb = Params.send_request_backlog_callbacks.splice(0, 1)[0];
                        cb();
                    }
                }, 10);
            });
        } catch (e) {
            Utils.vLog(8, 'Unlocking ' + socket.address().port + ' [because of exception]');
            Params.locks[socket.address().port] = false;
            Utils.debugLog('Error while writing to socket...');
            Utils.debugLog(e);
        }
    },

    getCipherAlgorithm: (keyHex) => {
      return `aes-${(keyHex.length / 2) * 8}-cbc`;
    },

    encrypt: (request) => {
      let encryptedRequest;
      try {
          let iv = new Buffer(crypto.randomBytes(16), 'hex');
          let cipher = crypto.createCipheriv(Utils.getCipherAlgorithm(Params.connection.key), new Buffer(Params.connection.key, 'hex'), iv);
          return iv.toString('hex') + ':' + Params.connection.client_id + ':' + cipher.update(request, 'utf-8', 'base64') + cipher.final('base64') + PACKET_DELIMITER;
      } catch (err) {
          Utils.debugLog(err);
      }
      return '';
    },

    // Decrypt response from the server using symmetric key
    decrypt: (data) => {
        if (Params.connection === null) {
            return null;
        }
        try {
            const resp = data.split(':');
            const iv = resp[0];
            const clientId = resp.length === 3 ? resp[1] : '';
            const actualData = resp.length === 3 ? resp[2] : resp[1];
            const binaryData = new Buffer(actualData, 'base64');
            Utils.vLog(8, 'Reading ' + data.trim() + ' >>> parts: ' + iv + ' >>> ' + actualData.trim() + ' >>> ' + Params.connection.key);
            let decipher = crypto.createDecipheriv(Utils.getCipherAlgorithm(Params.connection.key), new Buffer(Params.connection.key, 'hex'), new Buffer(iv, 'hex'));
            decipher.setAutoPadding(false);

            let plain = decipher.update(binaryData, 'base64', 'utf-8');
            plain += decipher.final('utf-8');
            // Remove non-ascii characters from decrypted text ! Argggh!
            plain = plain.replace(/[^A-Za-z 0-9 \.,\?""!@#\$%\^&\*\(\)-_=\+;:<>\/\\\|\}\{\[\]`~]*/g, '');
            return plain;
        } catch (err) {
            Utils.vLog(9, 'decrypt-error: ');
            Utils.vLog(9, err);
        }

        return null;
    },

    extractPublicKey: (privateKey) => {
        const key = new NodeRSA(privateKey.key);
        return key.exportKey('public');
    },

    generateKeypair: (keySize) => {
        const key = new NodeRSA({b: keySize});
        key.setOptions({encryptionScheme: 'pkcs1'});
        Utils.debugLog('Key generated');
        return {
            privatePEM: key.exportKey('private'),
            publicPEM: key.exportKey('public'),
        };
    },

    // Decrypt response from the server using asymetric key
    decryptRSA: (response, privateKey) => {
        try {
            return crypto.privateDecrypt(privateKey, new Buffer(response.toString(), 'base64')).toString('utf-8');
        } catch (err) {
            Utils.log(err);
        }
        return null;
    },

    // Encrypts string using key
    encryptRSA: (str, publicKey) => {
        try {
            return crypto.publicEncrypt(publicKey, new Buffer(str, 'utf-8')).toString('base64');
        } catch (err) {
            Utils.log(err);
        }
        return null;
    }
};

// Handle response from the server on connection requests
Params.connection_socket.on('data', (data) => {
    let decryptedData = Utils.decrypt(data.toString());
    if (decryptedData === null) {
        decryptedData = Utils.decryptRSA(data, Params.rsa_key.privateKey);
    }
    if (decryptedData === null) {
        Utils.log('Unable to read response: ' + data);
        return;
    }
    const dataJson = JSON.parse(decryptedData.toString());
    Utils.vLog(8, 'Connection: ');
    Utils.vLog(8, dataJson);
    if (dataJson.status === 0 && typeof dataJson.key !== 'undefined' && dataJson.ack === 0) {
        Utils.debugLog('Connecting to Residue Server...(ack)');
        
         // connection re-estabilished
        Params.disconnected_by_remote = false;
        
        Params.connection = dataJson;
        // Need to acknowledge
        const request = {
            _t: Utils.getTimestamp(),
            type: ConnectType.Acknowledgement,
            client_id: Params.connection.client_id
        };
        Utils.sendRequest(request, Params.connection_socket, true);
    } else if (dataJson.status === 0 && typeof dataJson.key !== 'undefined' && dataJson.ack === 1) {
        Utils.debugLog('Estabilishing full connection...');
        Params.connection = dataJson;
        Params.connected = true;
        Utils.vLog(8, `Connection socket: ${Params.connection_socket.address().port}`);
        if (typeof Params.options.access_codes === 'object') {
            if (!Params.token_socket_connected) {
                Params.token_socket.connect(Params.connection.token_port, Params.options.host, function() {
                    Params.token_socket_connected = true;
                    Utils.vLog(8, `Token socket: ${Params.token_socket.address().port}`);
                    if (Utils.hasFlag(Flag.REQUIRES_TOKEN)) {
                        Utils.debugLog('Obtaining tokens...');
                        Params.options.access_codes.forEach(function(item) {
                            obtainToken(item.logger_id, item.code);
                        });
                    }
                });
            }
        } else {
            Utils.log('MISSING: access_codes: ' + (typeof Params.options.access_codes));
        }
        if (!Params.logging_socket_connected) {
            Params.logging_socket.connect(Params.connection.logging_port, Params.options.host, function() {
                Utils.log(`Connected to Residue (v${Params.connection.server_info.version})!`);
                Params.logging_socket_connected = true;
                Utils.vLog(8, `Logging socket: ${Params.logging_socket.address().port}`);
                Params.connecting = false;
                const callbackCounts = Params.logging_socket_callbacks.length;
                for (let idx = 0; idx < callbackCounts; ++idx) {
                    const cb = Params.logging_socket_callbacks.splice(0, 1)[0];
                    cb();
                }
            });
        } else {
            Params.connecting = false;
            const callbackCounts = Params.logging_socket_callbacks.length;
            for (let idx = 0; idx < callbackCounts; ++idx) {
                const cb = Params.logging_socket_callbacks.splice(0, 1)[0];
                cb();
            }
        }
    } else {
        Utils.log('Error while connecting to server: ');
        Utils.log(dataJson);
        Params.connecting = false;
    }
});

// Handle when connection is destroyed
Params.connection_socket.on('close', () => {
    Utils.log('Remote connection closed!');
    if (Params.connected) {
        Params.disconnected_by_remote = true;
    }
    disconnect();
});

Params.connection_socket.on('error', (error) => {
    Utils.log('Error occurred while connecting to residue server');
    Utils.log(error);
});


// Handle response for tokens, this stores tokens in to Params.tokens
Params.token_socket.on('data', (data) => {
    let decryptedData = Utils.decrypt(data.toString());
    if (decryptedData === null) {
        Utils.log('Unable to read response: ' + data);
        return;
    }
    Utils.debugLog(decryptedData.toString());
    try {
        const dataJson = JSON.parse(decryptedData.toString());
        Utils.vLog(7, 'Decoded json successfully');
        if (dataJson.status === 0) {
            dataJson.dateCreated = Utils.now();
            Params.tokens[dataJson.loggerId] = dataJson;
            const queuePos = Params.token_request_queue.indexOf(dataJson.loggerId);
            if (queuePos !== -1) {
                Params.token_request_queue.splice(queuePos, 1);
            }
            Utils.vLog(8, 'New token: ');
            Utils.vLog(8, dataJson);
            const callbacksCount = Params.token_socket_callbacks.length;
            Utils.debugLog('Token callbacks: ' + callbacksCount);
            for (let idx = 0; idx < callbacksCount; ++idx) {
                Utils.debugLog('Token callback()');
                const cb = Params.token_socket_callbacks.splice(0, 1)[0];
                cb();
                Utils.debugLog('Done Token callback()');
            }
        } else {
            Utils.log('Error while obtaining token: ' + dataJson.error_text);
        }
    } catch (e) {
        Utils.log('Exception while obtaining token: ');
        Utils.log(e);
    }
});

// Handles destruction of connection to token server
Params.token_socket.on('close', () => {
    Params.token_socket_connected = false;
});

// Handle destruction of connection to logging server
Params.logging_socket.on('close', () => {
    Params.logging_socket_connected = false;
});


// Notice we do not have any handler for logging_socket response
// this is because that is async connection
Params.logging_socket.on('data', (data) => {
});

// Obtain token for the logger that requires token
const obtainToken = (loggerId, accessCode) => {
    if (!Params.token_socket_connected) {
        Utils.log('Not connected to the token server yet');
        return;
    }

    if (Params.token_request_queue.indexOf(loggerId) !== -1) {
        Utils.debugLog('Token already requested for [' + loggerId + ']');
        return;
    }
    Utils.debugLog('obtainToken(' + loggerId + ', ' + accessCode + ')');
    if (accessCode === null) {
        // Get from map (recursive)
        if (typeof Params.options.access_codes !== 'undefined') {
            let found = false;
            Params.options.access_codes.forEach((item) => {
                if (item.logger_id === loggerId && typeof item.code !== 'undefined' && item.code.length !== 0) {
                    Utils.debugLog('Found access code');
                    found = true;
                    accessCode = item.code;
                    return;
                }
            });
            if (!found) {
                if (Utils.hasFlag(Flag.ALLOW_DEFAULT_ACCESS_CODE)) {
                    Utils.debugLog('Trying to get token with default access code');
                    // try without access code
                    obtainToken(loggerId, DEFAULT_ACCESS_CODE);
                } else {
                    Utils.log('ERROR: Access code for logger [' + loggerId + '] not provided. Loggers without access code are not allowed by the server.');
                    return;
                }
            }
        } else {
            if (Utils.hasFlag(Flag.ALLOW_DEFAULT_ACCESS_CODE)) {
                Utils.debugLog('Trying to get token with default access code');
                accessCode = DEFAULT_ACCESS_CODE;
            } else {
                Utils.log('ERROR: Loggers without access code are not allowed by the server');
                return;
            }
        }
    }
    if (accessCode === null) {
        // last hope!
        Utils.debugLog('Forcing default access code');
        accessCode = DEFAULT_ACCESS_CODE;
    }
    Utils.debugLog('Obtaining token for [' + loggerId + '] with access code [' + accessCode + ']');
    const request = {
        _t: Utils.getTimestamp(),
        logger_id: loggerId,
        access_code: accessCode
    };
    Params.token_request_queue.push(loggerId);
    Utils.sendRequest(request, Params.token_socket);
}

const shouldTouch = () => {
    if (!Params.connected || Params.connecting) {
        // Can't touch 
        return false;
    }
    if (Params.connection.age === 0) {
        // Always alive!
        return false;
    }
    return Params.connection.age - (Utils.now() - Params.connection.date_created) < TOUCH_THRESHOLD;
}

const touch = () => {
    if (Params.connected) {
        if (Params.connecting) {
           Utils.debugLog('Still touching...');
           return;
        }
        if (isClientValid()) {
            Utils.debugLog('Touching...');
            const request = {
                _t: Utils.getTimestamp(),
                type: ConnectType.Touch,
                client_id: Params.connection.client_id
            };
            Utils.sendRequest(request, Params.connection_socket);
            Params.connecting = true;
        } else {
            Utils.log('Could not touch, client already dead ' + (Params.connection.date_created + Params.connection.age) + ' < ' + Utils.now());
        }
    }
}

const isClientValid = () => {
    if (!Params.connected) {
        return false;
    }
    if (Params.connection.age == 0) {
        return true;
    }
    return Params.connection.date_created + Params.connection.age >= Utils.now();
}

const getToken = (loggerId) => {
    return typeof Params.tokens[loggerId] === 'undefined' ? '' : Params.tokens[loggerId].token;
}

const hasValidToken = (loggerId) => {
    if (!Utils.hasFlag(Flag.REQUIRES_TOKEN)) {
        return true;
    }
    let t = Params.tokens[loggerId];
    return typeof t !== 'undefined' && (t.life === 0 || Utils.now() - t.dateCreated < t.life);
}

// Returns UTC time
const getCurrentTimeUTC = () => {
    const newDate = new Date();
    return newDate.getTime() + newDate.getTimezoneOffset() * 60000;
}

// Send log request to the server. No response is expected
const sendLogRequest = (level, loggerId, sourceFile, sourceLine, sourceFunc, verboseLevel, logDatetime, format, ...args) => {
    let datetime = logDatetime;
    if (typeof datetime === 'undefined') {
        datetime = Params.options.utc_time ? getCurrentTimeUTC() : new Date().getTime();
        if (Params.options.time_offset) {
            datetime += (1000 * Params.options.time_offset); // offset is in seconds
        }
    }
    if (Params.connecting) {
       Utils.debugLog('Still connecting...');
       Params.logging_socket_callbacks.push(() => {
            sendLogRequest(level, loggerId, sourceFile, sourceLine, sourceFunc, verboseLevel, datetime, format, ...args);
       });
       return;
    }

    if (!Params.connected) {
        Utils.log('Not connected to the server yet');
        if (Params.disconnected_by_remote) {
            Utils.debugLog('Queueing...');
            Params.logging_socket_callbacks.push(() => {
                 sendLogRequest(level, loggerId, sourceFile, sourceLine, sourceFunc, verboseLevel, datetime, format, ...args);
            });
            const totalListener = Params.connection_socket.listenerCount('connect');
            if (totalListener >= 1) {
                Utils.log('Checking for connection...' + totalListener);
                Params.connection_socket.emit('connect');
            } else {
                    Utils.log('Retrying to connect...');
                connect(Params.options);
            }
        }
        return;
    }

    if (Params.token_request_queue.indexOf(loggerId) !== -1) {
        Utils.debugLog('Waiting for token for logger [' + loggerId + '], requeueing...');
        Params.token_socket_callbacks.push(function() {
            Utils.debugLog('Sending log from requeued token callback... [' + loggerId + ']');
            sendLogRequest(level, loggerId, sourceFile, sourceLine, sourceFunc, verboseLevel, datetime, format, ...args);
        });
        return;
    }

    Utils.debugLog('Checking health...[' + loggerId + ']');

    if (!isClientValid()) {
        Utils.debugLog('Resetting connection...');
        Params.logging_socket_callbacks.push(() => {
            Utils.debugLog('Sending log from log callback... [' + loggerId + ']');
            sendLogRequest(level, loggerId, sourceFile, sourceLine, sourceFunc, verboseLevel, datetime, format, ...args);
        });
        Utils.debugLog('Destroying connection socket');
        Params.connection_socket.destroy();
        Params.token_socket.destroy();
        Params.logging_socket.destroy();
        disconnect();
        connect(Params.options);
        return;
    }

    if (shouldTouch()) {
        Utils.debugLog('Touching first...');
        Params.logging_socket_callbacks.push(() => {
            Utils.debugLog('Sending log from touch callback... [' + loggerId + ']');
            sendLogRequest(level, loggerId, sourceFile, sourceLine, sourceFunc, verboseLevel, datetime, format, ...args);
        });
        touch();
        return;
    }

    if (!hasValidToken(loggerId)) {
        Utils.debugLog('Obtaining token first... [' + loggerId + ']');
        Params.token_socket_callbacks.push(() => {
            Utils.debugLog('Sending log from token callback... [' + loggerId + ']');
            sendLogRequest(level, loggerId, sourceFile, sourceLine, sourceFunc, verboseLevel, datetime, format, ...args);
        });
        obtainToken(loggerId, null /* means resolve in function */);
        return;
    }

    Utils.debugLog('Sending log request [' + loggerId  + ']...');

    const cpy = args;
    for (var idx = 0; idx < cpy.length; ++idx) {
        if (typeof cpy[idx] === 'object') {
            cpy[idx] = JSON.stringify(cpy[idx]);
        }
    }
    const request = {
        datetime: datetime,
        logger: loggerId,
        msg: util.format(format, ...cpy),
        file: sourceFile,
        line: sourceLine,
        func: sourceFunc,
        app: Params.options.application_id,
        level: level,
    };
    if (Utils.hasFlag(Flag.REQUIRES_TOKEN)) {
        request.token = getToken(loggerId);
    }
    if (typeof verboseLevel !== 'undefined') {
        request.vlevel = verboseLevel;
    }
    if (Params.options.plain_request) {
        request.client_id = Params.connection.client_id;
    }
    Utils.sendRequest(request, Params.logging_socket, false, Params.options.plain_request && Utils.hasFlag(Flag.ALLOW_PLAIN_LOG_REQUEST), Utils.hasFlag(Flag.COMPRESSION));
}

const isNormalInteger = (str) => {
    var n = Math.floor(Number(str));
    return String(n) === str && n >= 0;
}

const loadConfiguration = (jsonFilename) => {
    if (typeof jsonFilename === 'undefined') {
        Utils.log('Please select JSON filename that contains configurations');
        return false;
    }
    Params.options = JSON.parse(fs.readFileSync(path.resolve(jsonFilename), 'utf8'));
    Utils.log('Configuration loaded');
    return true;
}

// Securily connect to residue server using defined options
const connect = (options) => {
    if (Params.connected && Params.connection !== null) {
        Utils.log('Already connected to the server with ID [' + Params.connection.client_id + ']')
        return;
    }
    Params.connecting = true;
    try {
        Params.options = typeof options === 'undefined' ? Params.options : options;
        // Normalize
        if (typeof Params.options.url !== 'undefined') {
          const parts = Params.options.url.split(':');
          if (parts.length < 2 || !isNormalInteger(parts[1])) {
            throw 'Invalid URL format for residue';
          }
          Params.options.host = parts[0];
          Params.options.connect_port = parseInt(parts[1]);
        }
        if (typeof Params.options.client_id === 'undefined' &&
                typeof Params.options.client_private_key === 'undefined') {
            // Generate new key for key-exchange
            const keySize = Params.options.rsa_key_size || 2048;
            Utils.log('Generating ' + keySize + '-bit key...');
            const generatedKey = Utils.generateKeypair(keySize);
            Params.rsa_key = {
                isGenerated: true,
                privateKey: {
                    key: generatedKey.privatePEM,
                    padding: crypto.constants.RSA_PKCS1_PADDING,
                },
                publicKey: {
                    key: generatedKey.publicPEM,
                    padding: crypto.constants.RSA_PKCS1_PADDING,
                }
            };
            Utils.debugLog('Key generated');
        } else {
            Params.rsa_key = {
                generated: false,
                privateKey: {
                    key: fs.readFileSync(path.resolve(Params.options.client_private_key)).toString(),
                    passphrase: Params.options.client_key_secret || null,
                    padding: crypto.constants.RSA_PKCS1_PADDING,
                },
                publicKey: {
                    padding: crypto.constants.RSA_PKCS1_PADDING,
                }
            };
            if (typeof Params.options.client_public_key !== 'undefined') {
                Params.rsa_key.publicKey.key = fs.readFileSync(path.resolve(Params.options.client_public_key)).toString();
            } else {
                if (Params.rsa_key.privateKey.passphrase === null) {
                    Params.rsa_key.publicKey.key = Utils.extractPublicKey(Params.rsa_key.privateKey);
                } else {
                    throw 'ERROR: You specified client_key_secret and did not provide client_public_key. We cannot extract public-key for encrypted private keys. Please provide public key manually';
                }
            }
            Utils.vLog(8, 'Known client...');
        }
        if (typeof Params.options.server_public_key !== 'undefined') {
            Params.server_rsa_key = {
                publicKey: {
                    key: fs.readFileSync(path.resolve(Params.options.server_public_key)).toString(),
                    padding: crypto.constants.RSA_PKCS1_PADDING,
                },
            };
        }
        Utils.log('Intializing connection...');
        Params.connection_socket.connect(Params.options.connect_port, Params.options.host, () => {
            let request = {
                _t: Utils.getTimestamp(),
                type: ConnectType.Connect,
            };
            if (Params.rsa_key.isGenerated) {
                request.rsa_public_key = Utils.base64Encode(Params.rsa_key.publicKey.key);
            } else {
                request.client_id = Params.options.client_id;
            }
            let r = JSON.stringify(request);
            if (Params.server_rsa_key !== null) {
                r = Utils.encryptRSA(r, Params.server_rsa_key.publicKey);
            }
            const fullReq = r + PACKET_DELIMITER;
            Params.connection_socket.write(fullReq);
        });
    } catch (e) {
        Utils.log('Error occurred while connecting to residue server');
        Utils.log(e);
        Params.connecting = false;
    }
}

// Disconnect from the server safely.
const disconnect = () => {
    Utils.traceLog('disconnect()');
    Params.tokens = [];
    Params.token_request_queue = [];
    Params.connected = false;
    Params.connecting = false;
    Params.connection = null;
    Params.token_socket_connected = false;
    Params.logging_socket_connected = false;
    if (Params.connected) {
        try {
            if (Params.connection_socket.destroyed) {
                Utils.log('Disconnecting gracefully...');
                Params.token_socket.end();
                Params.logging_socket.end();
            } else {
                Utils.log('Disconnecting...');
                // Following will call 'close' -> disconnect -> gracefully close
                Params.connection_socket.end();
            }
        } catch (err) {
            
        }
    }
}

// Get location of callstack in <file>:<line> format
const getSourceLocation = (splitChar) => (new Error).stack.split('\n')[4].replace(' at ', '').trim().split(splitChar);

// Get file of callstack.
// See getSourceLocation
const getSourceFile = () => getSourceLocation(':')[0];

// Get line of callstack.
// See getSourceLocation
const getSourceLine = () => parseInt(getSourceLocation(':')[1]);

// Get func of call stack
// See getSourceLocation
const getSourceFunc = () => {
    const parts = getSourceLocation(' ');
    if (parts.length <= 1) {
        return 'anonymous';
    }
    return parts[0];
}

// Logger interface for user to send log messages to server
const Logger = function(id) {
    this.id = id;

    this.info = (format, ...args) => sendLogRequest(LoggingLevels.Info, this.id, getSourceFile(), getSourceLine(), getSourceFunc(), 0, undefined, format, ...args);

    this.error = (format, ...args) => sendLogRequest(LoggingLevels.Error, this.id, getSourceFile(), getSourceLine(), getSourceFunc(), 0, undefined, format, ...args);

    this.debug = (format, ...args) => sendLogRequest(LoggingLevels.Debug, this.id, getSourceFile(), getSourceLine(), getSourceFunc(), 0, undefined, format, ...args);

    this.warn = (format, ...args) => sendLogRequest(LoggingLevels.Warn, this.id, getSourceFile(), getSourceLine(), getSourceFunc(), 0, undefined, format, ...args);

    this.trace = (format, ...args) => sendLogRequest(LoggingLevels.Trace, this.id, getSourceFile(), getSourceLine(), getSourceFunc(), 0, undefined, format, ...args);

    this.fatal = (format, ...args) => sendLogRequest(LoggingLevels.Fatal, this.id, getSourceFile(), getSourceLine(), getSourceFunc(), 0, undefined, format, ...args);

    this.verbose = (level, format, ...args) => sendLogRequest(LoggingLevels.Verbose, this.id, getSourceFile(), getSourceLine(), getSourceFunc(), level, undefined, format, ...args);
}

// Get new logger with provided ID for writing logs
// Make sure you have provided us with corresponding access code for seamless connection if needed.
const getLogger = (id) => (new Logger(id));

const isConnected = () => Params.connected;

exports.loadConfiguration = loadConfiguration;
exports.connect = connect;
exports.disconnect = disconnect;
exports.getLogger = getLogger;
exports.isConnected = isConnected;
