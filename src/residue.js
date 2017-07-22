//
// Official residue client for NodeJS
//
// This module provides interface for connecting and interacting with
// residue server seamlessly, means, once you are connected this module
// takes care of expired tokens and clients and keep itself updated
// with latest tokens and ping server when needed to stay alive.
//
// https://github.com/muflihun/residue
// https://github.com/muflihun/residue-node
//

const fs = require('fs');
const path = require('path');
const net = require('net');
const zlib = require('zlib');
const crypto = require('crypto');
const NodeRSA = require('node-rsa');

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

    // whether connection is being made (enabled at connection_socket, disabled at logging_socket)
    connecting: false,

    // lock for mutex
    lock: false,

    // list of tokens currently available
    tokens: [],

    // Underlying sockets
    connection_socket: new net.Socket(),
    token_socket: new net.Socket(),
    logging_socket: new net.Socket(),

    // Debug logging
    debugging: false,
    verboseLevel: 9,

    // Status for sockets
    token_socket_connected: false,
    logging_socket_connected: false,

    // callbacks on specific occasions
    send_request_backlog_callbacks: [],
    logging_socket_callbacks: [],
    token_socket_callbacks: [],
};

// Various connection types accepted by the server
const ConnectType = {
    Connect: 1,
    Acknowledgement: 2,
    Ping: 3
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
  AUTHORIZE_LOGGERS_WITH_NO_ACCESS_CODE: 4,
  ALLOW_PLAIN_LOG_REQUEST: 8,
  ALLOW_BULK_LOG_REQUEST: 16,
  COMPRESSION: 512
};

const PACKET_DELIMITER = "\r\n\r\n";

// Utility static functions
const Utils = {
    log: function(m) {
        console.log(m);
    },

    debugLog: function(m) {
        if (Params.debugging) {
            console.log(m);
        }
    },

    vLog: function(l, m) {
        if (Params.debugging && l <= Params.verboseLevel) {
            console.log(m);
        }
    },

    hasFlag: function(f) {
        if (Params.connection === null) {
            return false;
        }
        return (Params.connection.flags & f) !== 0;
    },

    // Encode Base64
    base64Encode: function(str) {
        return new Buffer(str).toString('base64');
    },

    base64Decode: function(encoded) {
        return new Buffer(encoded, 'base64').toString('utf-8');
    },

    // Get current date in microseconds
    now: function() {
        return parseInt((new Date()).getTime() / 1000, 10);
    },
    
    getTimestamp: function() {
        return Utils.now();
    },

    // Send request to the server
    // This function decides whether to back-log the request or dispatch it to
    // the server
    sendRequest: function(request, socket, nolock /* = false */, sendPlain /* = false */, compress /* = false */) {
        if (typeof nolock === 'undefined') {
            nolock = false;
        }
        if (typeof sendPlain === 'undefined') {
            sendPlain = false;
        }
        if (typeof compress === 'undefined') {
            compress = false;
        }
        if (!nolock && Params.lock) {
            Params.send_request_backlog_callbacks.push(function() {
                Utils.sendRequest(request, socket, false, sendPlain, compress);
            });
            return;
        }
        if (sendPlain) {
            request.client_id = Params.connection.client_id;
        }
        let finalRequest = JSON.stringify(request);
        if (compress) {
            finalRequest = new Buffer(zlib.deflateSync(finalRequest)).toString('base64');
        }
        let encryptedRequest;
        if (!sendPlain) {
            try {
                let iv = new Buffer(crypto.randomBytes(16), 'hex');
                let cipher = crypto.createCipheriv('aes-256-cbc', new Buffer(Params.connection.key, 'hex'), iv);
                encryptedRequest = iv.toString('hex') + ':' + Params.connection.client_id + ':' + cipher.update(finalRequest, 'utf-8', 'base64') + cipher.final('base64') + PACKET_DELIMITER;
            } catch (err) {
                Utils.debugLog(err);
            }
        } else {
            encryptedRequest = finalRequest + PACKET_DELIMITER;
        }
        Utils.vLog(9, 'Payload (Plain): ' + finalRequest);
        Params.lock = true;
        try {
            Utils.debugLog('Sending...');
            socket.write(encryptedRequest, 'utf-8', function() {
                Params.lock = false;
                setTimeout(function() {
                    if (Params.send_request_backlog_callbacks.length > 0) {
                        const cb = Params.send_request_backlog_callbacks.splice(0, 1)[0];
                        cb();
                    }
                }, 10);
            });
        } catch (e) {
            Utils.debugLog("Error while writing to socket...");
            Utils.debugLog(e);
        }
    },

    // Decrypt response from the server using symmetric key
    decrypt: function(response) {
        if (Params.connection === null) {
            return null;
        }
        try {
            const resp = response.toString().split(':');
            const iv = resp[0];
            const clientId = resp.length === 3 ? resp[1] : '';
            const base64Data = new Buffer(resp.length === 3 ? resp[2] : resp[1], 'base64');
            let decipher = crypto.createDecipheriv('aes-256-cbc', new Buffer(Params.connection.key, 'hex'), new Buffer(iv, 'hex'));
            decipher.setAutoPadding(false);

            let plain = decipher.update(base64Data, 'base64', 'utf-8');
            plain += decipher.final('utf-8');
            // Remove non-ascii characters from decrypted text ! Argggh!
            plain = plain.replace(/[^A-Za-z 0-9 \.,\?""!@#\$%\^&\*\(\)-_=\+;:<>\/\\\|\}\{\[\]`~]*/g, '');
            return plain;
        } catch (err) {
            Utils.debugLog(err);
        }

        return null;
    },
    
    generateKeypair: function(keySize) {
        const key = new NodeRSA({b: keySize});
        key.setOptions({encryptionScheme: 'pkcs1'});
        Utils.debugLog('Key generated');
        return {
            privatePEM: key.exportKey('private'),
            publicPEM: key.exportKey('public'),
        };
    },

    // Decrypt response from the server using asymetric key
    decryptRSA: function(response, privateKey) {
        try {
            return crypto.privateDecrypt(privateKey, new Buffer(response.toString(), 'base64')).toString('utf-8');
        } catch (err) {
            Utils.log(err);
        }
        return null;
    },

    // Encrypts string using key
    encryptRSA: function(str, publicKey) {
        try {
            return crypto.publicEncrypt(publicKey, new Buffer(str, 'utf-8')).toString('base64');
        } catch (err) {
            Utils.log(err);
        }
        return null;
    }
};

// Handle response from the server on connection requests
Params.connection_socket.on('data', function(data) {
    let decryptedData = Utils.decrypt(data);
    if (decryptedData === null) {
        decryptedData = Utils.decryptRSA(data, Params.rsa_key.privateKey);
    }
    if (decryptedData === null) {
        Utils.log('Unable to read response: ' + data);
        return;
    }
    const dataJson = JSON.parse(decryptedData.toString());
    Utils.debugLog('Connection: ');
    Utils.debugLog(dataJson);
    if (dataJson.status === 0 && typeof dataJson.key !== 'undefined' && dataJson.ack === 0) {
        Utils.debugLog('Connecting to Residue Server...(step 2)');
        Params.connection = dataJson;
        // Need to acknowledge
        const request = {
            _t: Utils.getTimestamp(),
            type: ConnectType.Acknowledgement,
            client_id: Params.connection.client_id
        };
        Utils.sendRequest(request, Params.connection_socket, true);
    } else if (dataJson.status === 0 && typeof dataJson.key !== 'undefined' && dataJson.ack === 1) {
        Utils.debugLog('Connecting to Residue Server...(step 3)');
        Params.connection = dataJson;
        Params.connected = true;
        if (typeof Params.options.access_codes === 'object') {
            if (!Params.token_socket_connected) {
                Params.token_socket.connect(Params.connection.token_port, Params.options.host, function() {
                    Params.token_socket_connected = true;
                    Utils.debugLog('Obtaining tokens...');
                    Params.options.access_codes.forEach(function(item) {
                        obtainToken(item.logger_id, item.code);
                    });
                });
            }
        } else {
            Utils.log('MISSING: access_codes: ' + (typeof Params.options.access_codes));
        }
        if (!Params.logging_socket_connected) {
            Params.logging_socket.connect(Params.connection.logging_port, Params.options.host, function() {
                Utils.log('Connected to Residue!');
                Params.logging_socket_connected = true;
                Params.connecting = false;

                while (Params.logging_socket_callbacks.length > 0) {
                    const cb = Params.logging_socket_callbacks.splice(0, 1)[0];
                    cb();
                }
            });
        } else {
            Params.connecting = false;
            while (Params.logging_socket_callbacks.length > 0) {
                const cb = Params.logging_socket_callbacks.splice(0, 1)[0];
                cb();
            }
        }
    } else {
        Utils.log('Error while connecting to server: ');
        Utils.log(dataJson);
    }
});

// Handle when connection is destroyed
Params.connection_socket.on('close', function() {
});

Params.connection_socket.on('error', function(error) {
    Utils.log('Error occurred while connecting to residue server');
    Utils.log(error);
});


// Handle response for tokens, this stores tokens in to Params.tokens
Params.token_socket.on('data', function(data) {
    let decryptedData = Utils.decrypt(data);
    if (decryptedData === null) {
        Utils.log('Unable to read response: ' + data);
        return;
    }
    Utils.debugLog(decryptedData.toString());
    const dataJson = JSON.parse(decryptedData.toString());
    Utils.debugLog("Decoded json successfully");
    if (dataJson.status === 0) {
        dataJson.dateCreated = Utils.now();
        Params.tokens[dataJson.loggerId] = dataJson;
        while (Params.token_socket_callbacks.length > 0) {
            const cb = Params.token_socket_callbacks.splice(0, 1)[0];
            cb();
        }
    } else {
        Utils.log('Error while obtaining token: ' + dataJson.error_text);
    }
});

// Handles destruction of connection to token server
Params.token_socket.on('close', function() {
});

// Handle destruction of connection to logging server
Params.logging_socket.on('close', function() {
});


// Notice we do not have any handler for logging_socket response
// this is because that is async connection
Params.logging_socket.on('data', function(data) {
});

// Obtain token for the logger that requires token
obtainToken = function(loggerId, accessCode) {
    if (!Params.connected || Params.connecting) {
        Utils.log('Not connected to the server yet');
        return;
    }
    if (Params.lock) {
        Utils.debugLog('Already locked');
        return;
    }
    if (typeof accessCode === 'undefined') {
        // Get from map (recursive)
        if (typeof Params.options.access_codes !== 'undefined') {
            let found = false;
            Params.options.access_codes.forEach(function(item) {
                if (item.logger_id === loggerId && typeof item.code !== 'undefined' && item.code.length !== 0) {
                    Utils.debugLog('Found access code');
                    found = true;
                    accessCode = item.code;
                    return;
                }
            });
            if (!found) {
                if (Utils.hasFlag(Flag.AUTHORIZE_LOGGERS_WITH_NO_ACCESS_CODE)) {
                    Utils.debugLog('Trying to get token with no access code');
                    // try without access code
                    obtainToken(loggerId, '');
                } else {
                    Utils.log('ERROR: Access code for logger [' + loggerId + '] not provided. Loggers without access code are not allowed by the server.');
                    return;
                }
            }
        } else {
            if (Utils.hasFlag(Flag.AUTHORIZE_LOGGERS_WITH_NO_ACCESS_CODE)) {
                Utils.debugLog('Trying to get token with no access code');
                accessCode = '';
            } else {
                Utils.log('ERROR: Loggers without access code are not allowed by the server');
                return;
            }
        }
    }
    Utils.debugLog('Obtaining token for [' + loggerId + '] with access code [' + accessCode + ']');
    const request = {
        _t: Utils.getTimestamp(),
        logger_id: loggerId,
        access_code: accessCode
    };
    Utils.sendRequest(request, Params.token_socket);
}

shouldSendPing = function(threshold/* = 60 */) {
    if (typeof threshold === 'undefined') {
        threshold = 60;
    }
    if (!Params.connected || Params.connecting) {
        // Can't send ping
        return false;
    }
    if (Params.connection.age === 0) {
        // Always alive!
        return false;
    }
    return Params.connection.age - (Utils.now() - Params.connection.date_created) <= threshold;
}

sendPing = function() {
    if (Params.connected) {
        if (isClientValid()) {
            Utils.debugLog('Pinging...');
            const request = {
                _t: Utils.getTimestamp(),
                type: ConnectType.Ping,
                client_id: Params.connection.client_id
            };
            Utils.sendRequest(request, Params.connection_socket);
        } else {
            Utils.log("Could not ping, client already dead " + (Params.connection.date_created + Params.connection.age) + " < " + Utils.now());
        }
    }
}

isClientValid = function() {
    if (!Params.connected) {
        return false;
    }
    if (Params.connection.age == 0) {
        return true;
    }
    return Params.connection.date_created + Params.connection.age >= Utils.now();
}

getToken = function(loggerId) {
    return typeof Params.tokens[loggerId] === 'undefined' ? '' : Params.tokens[loggerId].token;
}

hasValidToken = function(loggerId) {
    let t = Params.tokens[loggerId];
    return typeof t !== 'undefined' && (t.life === 0 || Utils.now() - t.dateCreated < t.life);
}

// Returns UTC time
getCurrentTimeUTC = function() {
    const newDate = new Date();
    return newDate.getTime() + newDate.getTimezoneOffset() * 60000;
}

// Send log request to the server. No response is expected
sendLogRequest = function(logMessage, level, loggerId, sourceFile, sourceLine, sourceFunc, verboseLevel) {
    if (Params.connecting) {
       Params.logging_socket_callbacks.push(function() {
            sendLogRequest(logMessage, level, loggerId, sourceFile, sourceLine, sourceFunc, verboseLevel);
       });
       return;
    }

    if (!Params.connected) {
        Utils.log('Not connected to the server yet');
        return;
    }

    Utils.debugLog("Checking health...");

    if (!isClientValid()) {
        Utils.debugLog("Resetting connection...");
        Params.logging_socket_callbacks.push(function() {
            sendLogRequest(logMessage, level, loggerId, sourceFile, sourceLine, sourceFunc, verboseLevel);
        });
        Params.connection_socket.destroy();
        disconnect();
        connect(Params.options);
        return;
    }

    if (shouldSendPing(60)) {
        Utils.debugLog("Pinging first...");
        Params.logging_socket_callbacks.push(function() {
            sendLogRequest(logMessage, level, loggerId, sourceFile, sourceLine, sourceFunc, verboseLevel);
        });
        sendPing();
        return;
    }

    if (!hasValidToken(loggerId)) {
        Utils.debugLog("Obtaining token first...");
        Params.token_socket_callbacks.push(function() {
            sendLogRequest(logMessage, level, loggerId, sourceFile, sourceLine, sourceFunc, verboseLevel);
        });
        obtainToken(loggerId);
        return;
    }

    Utils.debugLog("Sending log request...");

    let datetime = Params.options.utc_time ? getCurrentTimeUTC() : new Date().getTime();
    if (Params.options.time_offset) {
        datetime += (1000 * Params.options.time_offset); // offset is in seconds
    }
    const request = {
        token: getToken(loggerId),
        datetime: datetime,
        logger: loggerId,
        msg: logMessage,
        file: sourceFile,
        line: sourceLine,
        func: sourceFunc,
        app: Params.options.application_id,
        level: level,
    };
    if (typeof verboseLevel !== 'undefined') {
        request.vlevel = verboseLevel;
    }
    Utils.sendRequest(request, Params.logging_socket, false, Params.options.plain_request && Utils.hasFlag(Flag.ALLOW_PLAIN_LOG_REQUEST), Utils.hasFlag(Flag.COMPRESSION));
}

isNormalInteger = function(str) {
    var n = Math.floor(Number(str));
    return String(n) === str && n >= 0;
}

loadConfiguration = function(jsonFilename) {
    if (typeof jsonFilename === 'undefined') {
        Utils.log('Please select JSON filename that contains configurations');
        return false;
    }
    Params.options = JSON.parse(fs.readFileSync(path.resolve(jsonFilename), 'utf8'));
    Utils.log('Configuration loaded');
    return true;
}

// Securily connect to residue server using defined options
connect = function(options) {
    if (Params.connected && Params.connection !== null) {
        Utils.log('Already connected to the server with ID [' + Params.connection.client_id + ']')
        return;
    }
    Params.connecting = true;
    let client = Params.connection_socket;
    try {
        Params.options = typeof options === 'undefined' ? Params.options : options;
        // Normalize
        if (typeof Params.options.url !== 'undefined') {
          const parts = Params.options.url.split(':');
          if (parts.length < 2 || !isNormalInteger(parts[1])) {
            throw "Invalid URL format for residue";
          }
          Params.options.host = parts[0];
          Params.options.connect_port = parseInt(parts[1]);
        }
        if (typeof Params.options.client_id === 'undefined' &&
                typeof Params.options.client_private_key === 'undefined' &&
                typeof Params.options.client_public_key === 'undefined') {
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
            Utils.log('Key generated');
        } else {
            Params.rsa_key = {
                generated: false,
                privateKey: {
                    key: fs.readFileSync(path.resolve(Params.options.client_private_key)).toString(),
                    passphrase: Params.options.client_key_secret || null,
                    padding: crypto.constants.RSA_PKCS1_PADDING,
                },
                publicKey: {
                    key: fs.readFileSync(path.resolve(Params.options.client_public_key)).toString(),
                    padding: crypto.constants.RSA_PKCS1_PADDING,
                },
            };
            Utils.log('Known client...');
        }
        if (typeof Params.options.server_public_key !== 'undefined') {
            Params.server_rsa_key = {
                publicKey: {
                    key: fs.readFileSync(path.resolve(Params.options.server_public_key)).toString(),
                    padding: crypto.constants.RSA_PKCS1_PADDING,
                },
            };
        }
        Utils.log('Connecting to the Residue server...');
        client.connect(Params.options.connect_port, Params.options.host, function() {
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
            client.write(fullReq);
        });
    } catch (e) {
        Utils.log('Error occurred while connecting to residue server');
        Utils.log(e);
        Params.connecting = false;
    }
}

// Disconnect from the server safely.
disconnect = function() {
    if (Params.connected) {
        if (Params.connection_socket.destroyed) {
            Utils.log('Disconnecting gracefully...');
            Params.token_socket.end();
            Params.logging_socket.end();
            Params.connected = false;
            Params.connection = null;
            Params.token_socket_connected = false;
            Params.logging_socket_connected = false;
        } else {
            Utils.log('Disconnecting...');
            // Following will call 'close' -> disconnect -> gracefully close
            Params.connection_socket.end();
        }
    }
}

// Get location of callstack in <file>:<line> format
getSourceLocation = function(splitChar) {
    return (new Error).stack.split('\n')[4].replace(' at ', '').trim().split(splitChar);
}

// Get file of callstack.
// See getSourceLocation
getSourceFile = function() {
    return getSourceLocation(':')[0];
}

// Get line of callstack.
// See getSourceLocation
getSourceLine = function() {
    return parseInt(getSourceLocation(':')[1]);
}

// Get func of call stack
// See getSourceLocation
getSourceFunc = function() {
    const parts = getSourceLocation(' ');
    if (parts.length <= 1) {
        return 'anonymous';
    }
    return parts[0];
}

// Logger interface for user to send log messages to server
Logger = function(id) {
    this.id = id;

    this.info = function(message) {
        sendLogRequest(message, LoggingLevels.Info, this.id, getSourceFile(), getSourceLine(), getSourceFunc());
    }

    this.error = function(message) {
        sendLogRequest(message, LoggingLevels.Error, this.id, getSourceFile(), getSourceLine(), getSourceFunc());
    }

    this.debug = function(message) {
        sendLogRequest(message, LoggingLevels.Debug, this.id, getSourceFile(), getSourceLine(), getSourceFunc());
    }

    this.warn = function(message) {
        sendLogRequest(message, LoggingLevels.Warn, this.id, getSourceFile(), getSourceLine(), getSourceFunc());
    }

    this.trace = function(message) {
        sendLogRequest(message, LoggingLevels.Trace, this.id, getSourceFile(), getSourceLine(), getSourceFunc());
    }

    this.fatal = function(message) {
        sendLogRequest(message, LoggingLevels.Fatal, this.id, getSourceFile(), getSourceLine(), getSourceFunc());
    }

    this.verbose = function(message, level) {
        sendLogRequest(message, LoggingLevels.Verbose, this.id, getSourceFile(), getSourceLine(), getSourceFunc(), level);
    }
}

// Get new logger with provided ID for writing logs
// Make sure you have provided us with corresponding access code for seamless connection if needed.
getLogger = function(id) {
    return new Logger(id);
}

exports.loadConfiguration = loadConfiguration;
exports.connect = connect;
exports.disconnect = disconnect;
exports.getLogger = getLogger;
