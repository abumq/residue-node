//
// Copyright 2017-present Zuhd Web Services
//
// This module provides bridge to use C++ client library
// to handle the connection and conversation with the server
//
// Author: @abumusamq
//
// https://muflihun.com
// https://zuhd.org
// https://github.com/zuhd-org/residue-node
// https://github.com/zuhd-org/residue-node-native
//

"use strict";

const util = require('util');
const residueNativeClient = require('residue-native');
const CommonUtils = require('residue-utils');

const Logger = function(id) {
  this.id = id;

  // we don't need this because binary comes with CreateLoggerAutomatically flag set
  // (see CMakeLists.txt) but will still do it so we have it available before hand
  residueNativeClient.register_logger(this.id);

  this.trace = (fmt, ...args) => this._write(CommonUtils.LoggingLevels.Trace, undefined, fmt, ...args);
  this.debug = (fmt, ...args) => this._write(CommonUtils.LoggingLevels.Debug, undefined, fmt, ...args);
  this.fatal = (fmt, ...args) => this._write(CommonUtils.LoggingLevels.Fatal, undefined, fmt, ...args);
  this.error = (fmt, ...args) => this._write(CommonUtils.LoggingLevels.Error, undefined, fmt, ...args);
  this.warn = (fmt, ...args) => this._write(CommonUtils.LoggingLevels.Warning, undefined, fmt, ...args);
  this.info = (fmt, ...args) => this._write(CommonUtils.LoggingLevels.Info, undefined, fmt, ...args);
  this.verbose = (vlevel, fmt, ...args) => this._write(CommonUtils.LoggingLevels.Verbose, vlevel, fmt, ...args);

  // private members

  this._sourceBaseIndex = 5;
  this._write = (level, vlevel, fmt, ...args) => {
    const fullMessage = CommonUtils.translateArgs(true, ...args);

    residueNativeClient.write_log(this.id,
      this._logSources.getSourceFile(),
      this._logSources.getSourceLine(),
      this._logSources.getSourceFunc(),
      util.format(fmt, ...fullMessage),
      level,
      vlevel);
  }

  this._logSources = {
    baseIndex: 6,
    getSourceFile: () => CommonUtils.getSourceFile(this._logSources.baseIndex),
    getSourceLine: () => CommonUtils.getSourceLine(this._logSources.baseIndex),
    getSourceFunc: () => CommonUtils.getSourceFunc(this._logSources.baseIndex),
  };
};

const ResidueClient = function() {
  this.version = residueNativeClient.version;

  this.type = () => 'native';

  this.connect = (json) => {
    if (typeof json === 'object') {
      loadConfiguration(json);
    }
    residueNativeClient.connect();
  };

  this.disconnect = residueNativeClient.disconnect;

  this.isConnected = residueNativeClient.is_connected;

  this.getLogger = (id) => (new Logger(id));

  this.loadConfiguration = (jsonOrFilename) => {
    const conf = CommonUtils.confJson(jsonOrFilename);
    if (conf === false) {
      console.error('Please select JSON or JSON filename that contains configurations');
      return false;
    }
    residueNativeClient.configure(conf);
    return true;
  };
};

module.exports = ResidueClient;
