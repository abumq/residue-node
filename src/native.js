//
// Copyright 2017-present Muflihun Labs
//
// This module provides bridge to use C++ client library
// to handle the connection and conversation with the server
//
// Author: @abumusamq
//
// https://muflihun.com
// https://muflihun.github.io/residue
// https://github.com/muflihun/residue-node
// https://github.com/muflihun/residue-node-native
//

"use strict";

const util = require('util');
const residue_native = require('residue-native');
const CommonUtils = require('residue-utils');

const Logger = function(id) {
  this.id = id;

  // we don't need this because binary comes with CreateLoggerAutomatically flag set
  // (see CMakeLists.txt) but will still do it so we have it available before hand
  residue_native.register_logger(this.id);

  this.trace = (fmt, ...args) => this._write_log(CommonUtils.LoggingLevels.Trace, undefined, fmt, ...args);
  this.debug = (fmt, ...args) => this._write_log(CommonUtils.LoggingLevels.Debug, undefined, fmt, ...args);
  this.fatal = (fmt, ...args) => this._write_log(CommonUtils.LoggingLevels.Fatal, undefined, fmt, ...args);
  this.error = (fmt, ...args) => this._write_log(CommonUtils.LoggingLevels.Error, undefined, fmt, ...args);
  this.warn = (fmt, ...args) => this._write_log(CommonUtils.LoggingLevels.Warning, undefined, fmt, ...args);
  this.info = (fmt, ...args) => this._write_log(CommonUtils.LoggingLevels.Info, undefined, fmt, ...args);
  this.verbose = (vlevel, fmt, ...args) => this._write_log(CommonUtils.LoggingLevels.Verbose, vlevel, fmt, ...args);

  // private members

  this._source_base_index = 5;
  this._write_log = (level, vlevel, fmt, ...args) => {
    const fullMessage = CommonUtils.translateArgs(true, ...args);

    residue_native.write_log(this.id,
      this.log_sources.getSourceFile(),
      this.log_sources.getSourceLine(),
      this.log_sources.getSourceFunc(),
      util.format(fmt, ...fullMessage),
      level,
      vlevel);
  }

  this.log_sources = {
    base_idx: 6,
    getSourceFile: () => CommonUtils.getSourceFile(this.log_sources.base_idx),
    getSourceLine: () => CommonUtils.getSourceLine(this.log_sources.base_idx),
    getSourceFunc: () => CommonUtils.getSourceFunc(this.log_sources.base_idx),
  };
};

const ResidueClient = function() {
  this.version = residue_native.version;

  this.type = () => 'native';

  this.connect = (json) => {
    if (typeof json === 'object') {
      loadConfiguration(json);
    }
    residue_native.connect();
  };

  this.disconnect = residue_native.disconnect;

  this.isConnected = residue_native.is_connected;

  this.getLogger = (id) => (new Logger(id));

  this.loadConfiguration = (jsonOrFilename) => {
    const conf = CommonUtils.confJson(jsonOrFilename);
    if (conf === false) {
      console.error('Please select JSON or JSON filename that contains configurations');
      return false;
    }
    residue_native.configure(conf);
    return true;
  };
};

module.exports = ResidueClient;
