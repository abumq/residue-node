//
// Official Node.js client library for Residue logging server
//
// Copyright 2017-present @abumq (Majid Q.)
//
// This module provides interface for connecting and interacting with
// residue server seamlessly. Once you are connected this module
// takes care of lost connections, expired clients
// and keep itself updated with parameters and touch server when
// needed to stay alive.
//

"use strict";

const fs = require('fs');
const path = require('path');
const net = require('net');
const util = require('util');
const zlib = require('zlib');
const NodeRSA = require('node-rsa');
const CommonUtils = require('residue-utils');
let crypto;
try {
  crypto = require('crypto');
} catch (err) {
  console.log('residue package requires crypto (https://nodejs.org/api/crypto.html). It is disabled in your version of node!');
}

const DEBUGGING = false;
const VERBOSE_LEVEL = 0;

// Various connection types accepted by the server
const ConnectType = {
  CONN: 1,
  ACK: 2,
  TOUCH: 3,
};

const Flag = {
  NONE: 0,
  ALLOW_UNKNOWN_LOGGERS: 1,
  ALLOW_BULK_LOG_REQUEST: 16,
  COMPRESSION: 256
};

const PACKET_DELIMITER = '\r\n\r\n';
const TOUCH_THRESHOLD = 60; // should always be min(client_age) - max(client_age/2)

const isNormalInteger = (str) => {
  var n = Math.floor(Number(str));
  return String(n) === str && n >= 0;
};

// Logger interface for user to send log messages to server
const Logger = function(id, client) {
  this.id = id;
  this.client = client;

  this.info = (format, ...args) => this._write(CommonUtils.LoggingLevels.Info, 0, format, ...args);
  this.error = (format, ...args) => this._write(CommonUtils.LoggingLevels.Error, 0, format, ...args);
  this.debug = (format, ...args) => this._write(CommonUtils.LoggingLevels.Debug, 0, format, ...args);
  this.warn = (format, ...args) => this._write(CommonUtils.LoggingLevels.Warning, 0, format, ...args);
  this.trace = (format, ...args) => this._write(CommonUtils.LoggingLevels.Trace, 0, format, ...args);
  this.fatal = (format, ...args) => this._write(CommonUtils.LoggingLevels.Fatal, 0, format, ...args);
  this.verbose = (vlevel, format, ...args) => this._write(CommonUtils.LoggingLevels.Verbose, vlevel, format, ...args);

  //private members

  this._write = (level, vlevel, format, ...args) => client._sendLogRequest(level,
    this.id,
    this._logSources.getSourceFile(),
    this._logSources.getSourceLine(),
    this._logSources.getSourceFunc(),
    vlevel,
    undefined,
    format,
    ...args);

  this._logSources = {
    baseIndex: 6,
    getSourceFile: () => CommonUtils.getSourceFile(this._logSources.baseIndex),
    getSourceLine: () => CommonUtils.getSourceLine(this._logSources.baseIndex),
    getSourceFunc: () => CommonUtils.getSourceFunc(this._logSources.baseIndex),
  };
};

// Utility static functions
const Utils = {
  log: (m, ...args) => {
    console.log(m, ...args);
  },

  debugLog: (m, ...args) => {
    if (DEBUGGING) {
      console.log(`DEBUG: `, m, ...args);
    }
  },

  traceLog: (m, ...args) => {
    if (DEBUGGING) {
      console.log(`TRACE: `, m, ...args);
    }
  },

  vLog: (level, m, ...args) => {
    if (DEBUGGING && level <= VERBOSE_LEVEL) {
      console.log(`VERBOSE ${level}: `, m, ...args);
    }
  },

  hasFlag: (f, connection) => {
    if (connection === null) {
      return false;
    }
    return (connection.flags & f) !== 0;
  },

  // Encode Base64
  base64Encode: str => new Buffer(str).toString('base64'),

  base64Decode: encoded => new Buffer(encoded, 'base64').toString('utf-8'),

  getCipherAlgorithm: keyHex => `aes-${(keyHex.length / 2) * 8}-cbc`,

  encrypt: (request, connection) => {
    let encryptedRequest;
    try {
      let iv = new Buffer(crypto.randomBytes(16), 'hex');
      let cipher = crypto.createCipheriv(Utils.getCipherAlgorithm(connection.key), new Buffer(connection.key, 'hex'), iv);
      return iv.toString('hex') + ':' + connection.client_id + ':' + cipher.update(request, 'utf-8', 'base64') + cipher.final('base64') + PACKET_DELIMITER;
    } catch (err) {
      Utils.debugLog(err);
    }
    return '';
  },

  // Decrypt response from the server using symmetric key
  decrypt: (data, connection) => {
    if (connection === null) {
      return null;
    }
    try {
      const resp = data.split(':');
      const iv = resp[0];
      const clientId = resp.length === 3 ? resp[1] : '';
      const actualData = resp.length === 3 ? resp[2] : resp[1];
      const binaryData = new Buffer(actualData, 'base64');
      Utils.vLog(8, 'Reading ' + data.trim() + ' >>> parts: ' + iv + ' >>> ' + actualData.trim() + ' >>> ' + connection.key);
      let decipher = crypto.createDecipheriv(Utils.getCipherAlgorithm(connection.key), new Buffer(connection.key, 'hex'), new Buffer(iv, 'hex'));
      decipher.setAutoPadding(false);

      let plain = decipher.update(binaryData, 'base64', 'utf-8');
      plain += decipher.final('utf-8');
      // Remove non-ascii characters from decrypted text ! Argggh!
      plain = plain.replace(/[^A-Za-z 0-9 \.,\?""!@#\$%\^&\*\(\)-_=\+;:<>\/\\\|\}\{\[\]`~]*/g, '');
      return plain;
    } catch (err) {
      Utils.vLog(9, 'decrypt-error: ', err);
    }

    return null;
  },

  extractPublicKey: privateKey => new NodeRSA(privateKey.key).exportKey('public'),

  generateKeypair: (keySize) => {
    const key = new NodeRSA({
      b: keySize
    });
    key.setOptions({
      encryptionScheme: 'pkcs1'
    });
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
  },

  // Get current date in microseconds
  now: () => parseInt((new Date()).getTime() / 1000, 10),

  getTimestamp: () => Utils.now(),

  // Returns UTC time
  getCurrentTimeUTC: () => {
    const newDate = new Date();
    return newDate.getTime() + newDate.getTimezoneOffset() * 60000;
  },
};

const ResidueClient = function() {

  this._params = {
    // user provided options for seamless connection
    //   app, host, connect_port
    options: {},

    // connecting object containing:
    //   client_id, age, date_created, key, logging_port
    connection: null,

    // rsaKey is keypair object
    rsaKey: null,

    // serverRsaKey is keypair object
    serverRsaKey: null,

    // whether connected to the server or not
    connected: false,

    // Underlying sockets
    connectionSocket: new net.Socket(),
    loggingSocket: new net.Socket(),

    // Status for sockets
    isLoggingSocketConnected: false,

    // callbacks on specific occasions
    sendRequestBacklogCallbacks: [],
    loggingSocketCallbacks: [],

    // locks for mutex
    locks: {},
  };

  this._params.locks[this._params.connectionSocket.address().port] = false;
  this._params.locks[this._params.loggingSocket.address().port] = false;

  // Send request to the server
  // This function decides whether to back-log the request or dispatch it to
  // the server
  this._sendRequest = (request, socket, nolock /* = false */ , compress /* = false */ ) => {
    if (typeof nolock === 'undefined') {
      nolock = false;
    }
    if (typeof compress === 'undefined') {
      compress = false;
    }
    if (!nolock && this._params.locks[socket.address().port]) {
      this._params.sendRequestBacklogCallbacks.push(() => {
        Utils.debugLog('Sending request via callback');
        this._sendRequest(request, socket, false, compress);
      });
      return;
    }
    let finalRequest = JSON.stringify(request);
    if (compress) {
      finalRequest = new Buffer(zlib.deflateSync(finalRequest)).toString('base64');
    }
    const encryptedRequest = Utils.encrypt(finalRequest, this._params.connection);
    Utils.vLog(9, 'Payload (Plain): ', encryptedRequest);
    Utils.vLog(8, 'Locking ' + socket.address().port);
    this._params.locks[socket.address().port] = true;
    try {
      Utils.debugLog('Sending...');
      const self = this;
      socket.write(encryptedRequest, 'utf-8', () => {
        self._params.locks[socket.address().port] = false;
        Utils.vLog(8, 'Unlocking ' + socket.address().port);
        setTimeout(() => {
          if (self._params.sendRequestBacklogCallbacks.length > 0) {
            const cb = self._params.sendRequestBacklogCallbacks.splice(0, 1)[0];
            cb();
          }
        }, 10);
      });
    } catch (e) {
      Utils.vLog(8, 'Unlocking ' + socket.address().port + ' [because of exception]', e);
      this._params.locks[socket.address().port] = false;
      Utils.debugLog('Error while writing to socket...');
      Utils.debugLog(e);
    }
  };

  // Handle response from the server on connection requests
  this._params.connectionSocket.on('data', (data) => {
    let decryptedData = Utils.decrypt(data.toString(), this._params.connection);
    if (decryptedData === null) {
      decryptedData = Utils.decryptRSA(data, this._params.rsaKey.privateKey);
    }
    if (decryptedData === null) {
      Utils.log('Unable to read response: ' + data);
      return;
    }
    const dataJson = JSON.parse(decryptedData.toString());
    Utils.vLog(8, 'Connection: ', dataJson);
    if (dataJson.status === 0 && typeof dataJson.key !== 'undefined' && dataJson.ack === 0) {
      Utils.debugLog('Connecting to Residue Server...(ack)');

      // connection re-estabilished
      this._params.disconnected_by_remote = false;

      this._params.connection = dataJson;
      // Need to acknowledge
      const request = {
        _t: Utils.getTimestamp(),
        type: ConnectType.ACK,
        client_id: this._params.connection.client_id
      };
      this._sendRequest(request, this._params.connectionSocket, true);
    } else if (dataJson.status === 0 && typeof dataJson.key !== 'undefined' && dataJson.ack === 1) {
      Utils.debugLog('Estabilishing full connection...');
      this._params.connection = dataJson;
      this._params.connected = true;
      Utils.vLog(8, `Connection socket: ${this._params.connectionSocket.address().port}`);
      if (!this._params.isLoggingSocketConnected) {
        this._params.loggingSocket.connect(this._params.connection.logging_port, this._params.options.host, () => {
          Utils.log(`Connected to Residue (v${this._params.connection.server_info.version})!`);
          this._params.isLoggingSocketConnected = true;
          Utils.vLog(8, `Logging socket: ${this._params.loggingSocket.address().port}`);
          this._params.connecting = false;
          const callbackCounts = this._params.loggingSocketCallbacks.length;
          for (let idx = 0; idx < callbackCounts; ++idx) {
            const cb = this._params.loggingSocketCallbacks.splice(0, 1)[0];
            cb();
          }
        });
      } else {
        this._params.connecting = false;
        const callbackCounts = this._params.loggingSocketCallbacks.length;
        for (let idx = 0; idx < callbackCounts; ++idx) {
          // trigger all the pending callbacks from backlog
          this._params.loggingSocketCallbacks.splice(0, 1)[0]();
        }
      }
    } else {
      Utils.log('Error while connecting to server: ');
      Utils.log(dataJson);
      this._params.connecting = false;
    }
  });

  // Handle when connection is destroyed
  this._params.connectionSocket.on('close', () => {
    Utils.log('Remote connection closed!');
    if (this._params.connected) {
      this._params.disconnected_by_remote = true;
    }
    this.disconnect();
  });

  this._params.connectionSocket.on('error', (error) => {
    Utils.log('Error occurred while connecting to residue server');
    Utils.log(error);
  });

  // Handle destruction of connection to logging server
  this._params.loggingSocket.on('close', () => {
    this._params.isLoggingSocketConnected = false;
  });

  // Notice we do not have any handler for loggingSocket response
  // this is because that is async connection
  this._params.loggingSocket.on('data', () => {});

  this._shouldTouch = () => {
    if (!this._params.connected || this._params.connecting) {
      // Can't touch
      return false;
    }
    if (this._params.connection.age === 0) {
      // Always alive!
      return false;
    }
    return this._params.connection.age - (Utils.now() - this._params.connection.date_created) < TOUCH_THRESHOLD;
  };

  this._touch = () => {
    if (this._params.connected) {
      if (this._params.connecting) {
        Utils.debugLog('Still touching...');
        return;
      }
      if (this._isClientValid()) {
        Utils.debugLog('Touching...');
        const request = {
          _t: Utils.getTimestamp(),
          type: ConnectType.TOUCH,
          client_id: this._params.connection.client_id
        };
        this._sendRequest(request, this._params.connectionSocket);
        this._params.connecting = true;
      } else {
        Utils.log('Could not touch, client already dead ' + (this._params.connection.date_created + this._params.connection.age) + ' < ' + Utils.now());
      }
    }
  };

  this._isClientValid = () => {
    if (!this._params.connected) {
      return false;
    }
    if (this._params.connection.age == 0) {
      return true;
    }
    return this._params.connection.date_created + this._params.connection.age >= Utils.now();
  };

  // Send log request to the server. No response is expected
  this._sendLogRequest = (level, loggerId, sourceFile, sourceLine, sourceFunc, verboseLevel, logDatetime, format, ...args) => {
    let datetime = logDatetime;
    if (typeof datetime === 'undefined') {
      datetime = this._params.options.utc_time ? Utils.getCurrentTimeUTC() : new Date().getTime();
      if (this._params.options.time_offset) {
        datetime += (1000 * this._params.options.time_offset); // offset is in seconds
      }
    }
    if (this._params.connecting) {
      Utils.debugLog('Still connecting...');
      this._params.loggingSocketCallbacks.push(() => {
        this._sendLogRequest(level, loggerId, sourceFile, sourceLine, sourceFunc, verboseLevel, datetime, format, ...args);
      });
      return;
    }

    if (!this._params.connected) {
      Utils.log('Not connected to the server yet');
      if (this._params.disconnected_by_remote) {
        Utils.debugLog('Queueing...');
        this._params.loggingSocketCallbacks.push(() => {
          this._sendLogRequest(level, loggerId, sourceFile, sourceLine, sourceFunc, verboseLevel, datetime, format, ...args);
        });
        const totalListener = this._params.connectionSocket.listenerCount('connect');
        if (totalListener >= 1) {
          Utils.log('Checking for connection...' + totalListener);
          this._params.connectionSocket.emit('connect');
        } else {
          Utils.log('Retrying to connect...');
          this.connect(this._params.options);
        }
      }
      return;
    }

    Utils.debugLog('Checking health...[' + loggerId + ']');

    if (!this._isClientValid()) {
      Utils.debugLog('Resetting connection...');
      this._params.loggingSocketCallbacks.push(() => {
        Utils.debugLog('Sending log from log callback... [' + loggerId + ']');
        sendLogRequest(level, loggerId, sourceFile, sourceLine, sourceFunc, verboseLevel, datetime, format, ...args);
      });
      Utils.debugLog('Destroying connection socket');
      this._params.connectionSocket.destroy();
      this._params.loggingSocket.destroy();
      disconnect();
      connect(this._params.options);
      return;
    }

    if (this._shouldTouch()) {
      Utils.debugLog('Touching first...');
      this._params.loggingSocketCallbacks.push(() => {
        Utils.debugLog('Sending log from touch callback... [' + loggerId + ']');
        this._sendLogRequest(level, loggerId, sourceFile, sourceLine, sourceFunc, verboseLevel, datetime, format, ...args);
      });
      this._touch();
      return;
    }

    Utils.debugLog('Sending log request [' + loggerId + ']...');

    const fullMessage = CommonUtils.translateArgs(true, ...args);
    const request = {
      _t: Utils.getTimestamp(),
      datetime: datetime,
      logger: loggerId,
      msg: util.format(format, ...fullMessage),
      file: sourceFile,
      line: sourceLine,
      func: sourceFunc,
      app: this._params.options.application_id,
      level: level,
    };
    if (typeof verboseLevel !== 'undefined') {
      request.vlevel = verboseLevel;
    }
    this._sendRequest(request, this._params.loggingSocket, false, Utils.hasFlag(Flag.COMPRESSION, this._params.connection));
  };

  // public exported functions

  this.version = () => require('./../package.json').version;

  this.type = () => 'js';

  this.isConnected = () => this._params.connected;

  // Securily connect to residue server using defined options
  this.connect = (options) => {
    if (this._params.connected && this._params.connection !== null) {
      Utils.log('Already connected to the server with ID [' + this._params.connection.client_id + ']')
      return;
    }
    this._params.connecting = true;
    try {
      this._params.options = typeof options === 'undefined' ? this._params.options : options;
      // Normalize
      if (typeof this._params.options.url !== 'undefined') {
        const parts = this._params.options.url.split(':');
        if (parts.length < 2 || !isNormalInteger(parts[1])) {
          throw 'Invalid URL format for residue';
        }
        this._params.options.host = parts[0];
        this._params.options.connect_port = parseInt(parts[1]);
      }
      if (typeof this._params.options.client_id === 'undefined' &&
        typeof this._params.options.client_private_key === 'undefined') {
        // Generate new key for key-exchange
        const keySize = this._params.options.rsaKey_size || 2048;
        Utils.log('Generating ' + keySize + '-bit key...');
        const generatedKey = Utils.generateKeypair(keySize);
        this._params.rsaKey = {
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
        this._params.rsaKey = {
          generated: false,
          privateKey: {
            key: fs.readFileSync(path.resolve(this._params.options.client_private_key)).toString(),
            passphrase: this._params.options.client_key_secret ?
              new Buffer(this._params.options.client_key_secret, 'hex').toString('utf-8') : '',
            padding: crypto.constants.RSA_PKCS1_PADDING,
          },
          publicKey: {
            padding: crypto.constants.RSA_PKCS1_PADDING,
          }
        };
        if (typeof this._params.options.client_public_key !== 'undefined') {
          this._params.rsaKey.publicKey.key = fs.readFileSync(path.resolve(this._params.options.client_public_key)).toString();
        } else {
          if (this._params.rsaKey.privateKey.passphrase === null) {
            this._params.rsaKey.publicKey.key = Utils.extractPublicKey(this._params.rsaKey.privateKey);
          } else {
            throw 'ERROR: You specified client_key_secret and did not provide client_public_key. We cannot extract public-key for encrypted private keys. Please provide public key manually';
          }
        }
        Utils.vLog(8, 'Known client...');
      }
      if (typeof this._params.options.server_public_key !== 'undefined') {
        this._params.serverRsaKey = {
          publicKey: {
            key: fs.readFileSync(path.resolve(this._params.options.server_public_key)).toString(),
            padding: crypto.constants.RSA_PKCS1_PADDING,
          },
        };
      }
      Utils.log('Intializing connection...');
      this._params.connectionSocket.connect(this._params.options.connect_port, this._params.options.host, () => {
        let request = {
          _t: Utils.getTimestamp(),
          type: ConnectType.CONN,
        };
        if (this._params.rsaKey.isGenerated) {
          request.rsa_public_key = Utils.base64Encode(this._params.rsaKey.publicKey.key);
        } else {
          request.client_id = this._params.options.client_id;
        }
        let r = JSON.stringify(request);
        if (this._params.serverRsaKey !== null) {
          r = Utils.encryptRSA(r, this._params.serverRsaKey.publicKey);
        }
        const fullReq = r + PACKET_DELIMITER;
        this._params.connectionSocket.write(fullReq);
      });
    } catch (e) {
      Utils.log('Error occurred while connecting to residue server');
      Utils.log(e);
      this._params.connecting = false;
    }
  };

  // Disconnect from the server safely.
  this.disconnect = () => {
    Utils.traceLog('disconnect()');
    this._params.connected = false;
    this._params.connecting = false;
    this._params.connection = null;
    this._params.isLoggingSocketConnected = false;
    if (this._params.connected) {
      try {
        if (this._params.connectionSocket.destroyed) {
          Utils.log('Disconnecting gracefully...');
          this._params.loggingSocket.end();
        } else {
          Utils.log('Disconnecting...');
          // Following will call 'close' -> disconnect -> gracefully close
          this._params.connectionSocket.end();
        }
      } catch (err) {

      }
    }
  };

  this.loadConfiguration = (jsonOrFilename) => {
    const conf = CommonUtils.confJson(jsonOrFilename);
    if (conf === false) {
      console.error('Please select JSON or JSON filename that contains configurations');
      return false;
    }
    this._params.options = JSON.parse(conf);
    Utils.log('Configuration loaded');
    return true;
  };

  this.getLogger = id => new Logger(id, this);
};

module.exports = ResidueClient;
