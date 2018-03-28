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
const CommonUtils = require('./private/common');

const Logger = function(id) {
    this.id = id;

    this.trace = (fmt, ...args)           => this._write_log(CommonUtils.LoggingLevels.Trace, undefined, fmt, ...args);
    this.debug = (fmt, ...args)           => this._write_log(CommonUtils.LoggingLevels.Debug, undefined, fmt, ...args);
    this.fatal = (vlevel, fmt, ...args)   => this._write_log(CommonUtils.LoggingLevels.Fatal, vlevel, fmt, ...args);
    this.error = (fmt, ...args)           => this._write_log(CommonUtils.LoggingLevels.Error, undefined, fmt, ...args);
    this.warning = (fmt, ...args)         => this._write_log(CommonUtils.LoggingLevels.Warning, undefined, fmt, ...args);
    this.verbose = (vlevel, fmt, ...args) => this._write_log(CommonUtils.LoggingLevels.Verbose, vlevel, fmt, ...args);
    this.info = (fmt, ...args)            => this._write_log(CommonUtils.LoggingLevels.Info, undefined, fmt, ...args);

    // private members

    this._source_base_index = 5;
    this._write_log = (level, vlevel, fmt, ...args) => {
        const cpy = args;
        for (var idx = 0; idx < cpy.length; ++idx) {
            if (typeof cpy[idx] === 'object') {
                cpy[idx] = JSON.stringify(cpy[idx]);
            }
        }

        residue_native.write_log(this.id,
                                 this.log_sources.getSourceFile(),
                                 this.log_sources.getSourceLine(),
                                 this.log_sources.getSourceFunc(),
                                 util.format(fmt, ...cpy),
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

const loadConfiguration = (jsonOrFilename) => {
    const conf = CommonUtils.confJson(jsonOrFilename);
    if (conf === false) {
        console.error('Please select JSON or JSON filename that contains configurations');
        return false;
    }
    residue_native.configure(conf);
    return true;
};

const connect = (json) => {
    if (typeof json === 'object') {
        loadConfiguration(json);
    }
    residue_native.connect();
};

exports.version = residue_native.version;
exports.type = () => 'native';
exports.loadConfiguration = loadConfiguration;
exports.connect = connect;
exports.disconnect = residue_native.disconnect;
exports.isConnected = residue_native.is_connected;
exports.getLogger = (id) => (new Logger(id));
