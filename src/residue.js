//
// Official Node.js client library for Residue logging server
//
// Copyright 2017-present Muflihun Labs
//
// This module provides interface for connecting and interacting with
// residue server seamlessly. Once you are connected this module
// takes care of lost connections, expired clients
// and keep itself updated with parameters and touch server when 
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
const CommonUtils = require('./private/common');

const Params = {
    // user provided options for seamless connection
    //   app, host, connect_port
    options: {},

    // connecting object containing:
    //   client_id, age, date_created, key, logging_port
    connection: null,

    // rsa_key is keypair object
    rsa_key: null,

    // server_rsa_key is keypair object
    server_rsa_key: null,

    // whether connected to the server or not
    connected: false,

    // Underlying sockets
    connection_socket: new net.Socket(),
    logging_socket: new net.Socket(),

    // Debug logging
    debugging: false,
    verboseLevel: 0,

    // Status for sockets
    logging_socket_connected: false,

    // callbacks on specific occasions
    send_request_backlog_callbacks: [],
    logging_socket_callbacks: [],
    
    // locks for mutex
    locks: {},
    
};

Params.locks[Params.connection_socket.address().port] = false;
Params.locks[Params.logging_socket.address().port] = false;


// Various connection types accepted by the server
const ConnectType = {
    Connect: 1,
    Acknowledgement: 2,
    Touch: 3
};

const Flag = {
  NONE: 0,
  ALLOW_UNKNOWN_LOGGERS: 1,
  ALLOW_BULK_LOG_REQUEST: 16,
  COMPRESSION: 256
};

const PACKET_DELIMITER = '\r\n\r\n';
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
    sendRequest: (request, socket, nolock /* = false */, compress /* = false */) => {
        if (typeof nolock === 'undefined') {
            nolock = false;
        }
        if (typeof compress === 'undefined') {
            compress = false;
        }
        if (!nolock && Params.locks[socket.address().port]) {
            Params.send_request_backlog_callbacks.push(function() {
                Utils.debugLog('Sending request via callback');
                Utils.sendRequest(request, socket, false, compress);
            });
            return;
        }
        let finalRequest = JSON.stringify(request);
        if (compress) {
            finalRequest = new Buffer(zlib.deflateSync(finalRequest)).toString('base64');
        }
        const encryptedRequest = Utils.encrypt(finalRequest);
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


// Handle destruction of connection to logging server
Params.logging_socket.on('close', () => {
    Params.logging_socket_connected = false;
});


// Notice we do not have any handler for logging_socket response
// this is because that is async connection
Params.logging_socket.on('data', (data) => {
});

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

    Utils.debugLog('Checking health...[' + loggerId + ']');

    if (!isClientValid()) {
        Utils.debugLog('Resetting connection...');
        Params.logging_socket_callbacks.push(() => {
            Utils.debugLog('Sending log from log callback... [' + loggerId + ']');
            sendLogRequest(level, loggerId, sourceFile, sourceLine, sourceFunc, verboseLevel, datetime, format, ...args);
        });
        Utils.debugLog('Destroying connection socket');
        Params.connection_socket.destroy();
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

    Utils.debugLog('Sending log request [' + loggerId  + ']...');

    const cpy = args;
    for (var idx = 0; idx < cpy.length; ++idx) {
        if (typeof cpy[idx] === 'object') {
            cpy[idx] = JSON.stringify(cpy[idx]);
        }
    }
    const request = {
        _t: Utils.getTimestamp(),
        datetime: datetime,
        logger: loggerId,
        msg: util.format(format, ...cpy),
        file: sourceFile,
        line: sourceLine,
        func: sourceFunc,
        app: Params.options.application_id,
        level: level,
    };
    if (typeof verboseLevel !== 'undefined') {
        request.vlevel = verboseLevel;
    }
    Utils.sendRequest(request, Params.logging_socket, false, Utils.hasFlag(Flag.COMPRESSION));
}

const isNormalInteger = (str) => {
    var n = Math.floor(Number(str));
    return String(n) === str && n >= 0;
}

const loadConfiguration = (jsonOrFilename) => {
    if (typeof jsonOrFilename === 'undefined') {
        Utils.log('Please select JSON or JSON filename that contains configurations');
        return false;
    }
    Params.options = typeof jsonOrFilename === 'object' ? jsonOrFilename : JSON.parse(fs.readFileSync(path.resolve(jsonOrFilename), 'utf8'));
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
                    passphrase: Params.options.client_key_secret
                        ? new Buffer(Params.options.client_key_secret, 'hex').toString('utf-8') : null,
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
    Params.connected = false;
    Params.connecting = false;
    Params.connection = null;
    Params.logging_socket_connected = false;
    if (Params.connected) {
        try {
            if (Params.connection_socket.destroyed) {
                Utils.log('Disconnecting gracefully...');
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

// Logger interface for user to send log messages to server
const Logger = function(id) {
    this.id = id;

    this.info = (format, ...args) => sendLogRequest(CommonUtils.LoggingLevels.Info, this.id, CommonUtils.getSourceFile(), CommonUtils.getSourceLine(), CommonUtils.getSourceFunc(), 0, undefined, format, ...args);

    this.error = (format, ...args) => sendLogRequest(CommonUtils.LoggingLevels.Error, this.id, CommonUtils.getSourceFile(), CommonUtils.getSourceLine(), CommonUtils.getSourceFunc(), 0, undefined, format, ...args);

    this.debug = (format, ...args) => sendLogRequest(CommonUtils.LoggingLevels.Debug, this.id, CommonUtils.getSourceFile(), CommonUtils.getSourceLine(), CommonUtils.getSourceFunc(), 0, undefined, format, ...args);

    this.warn = (format, ...args) => sendLogRequest(CommonUtils.LoggingLevels.Warn, this.id, CommonUtils.getSourceFile(), CommonUtils.getSourceLine(), CommonUtils.getSourceFunc(), 0, undefined, format, ...args);

    this.trace = (format, ...args) => sendLogRequest(CommonUtils.LoggingLevels.Trace, this.id, CommonUtils.getSourceFile(), CommonUtils.getSourceLine(), CommonUtils.getSourceFunc(), 0, undefined, format, ...args);

    this.fatal = (format, ...args) => sendLogRequest(CommonUtils.LoggingLevels.Fatal, this.id, CommonUtils.getSourceFile(), CommonUtils.getSourceLine(), CommonUtils.getSourceFunc(), 0, undefined, format, ...args);

    this.verbose = (vlevel, format, ...args) => sendLogRequest(CommonUtils.LoggingLevels.Verbose, this.id, CommonUtils.getSourceFile(), CommonUtils.getSourceLine(), CommonUtils.getSourceFunc(), vlevel, undefined, format, ...args);
}

// Get new logger with provided ID for writing logs
const getLogger = (id) => (new Logger(id));

const isConnected = () => Params.connected;

exports.loadConfiguration = loadConfiguration;
exports.connect = connect;
exports.disconnect = disconnect;
exports.getLogger = getLogger;
exports.isConnected = isConnected;
