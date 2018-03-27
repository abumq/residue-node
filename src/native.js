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
//

"use strict";

const util = require('util');
const residue_native = require('residue-native');
const CommonUtils = require('./private/common');

const Logger = function(id) {
    this.id = id;

    this.trace = (fmt, ...args) => this._send_log_msg(CommonUtils.LoggingLevels.Trace, undefined, fmt, ...args);

    this.debug = (fmt, ...args) => this._send_log_msg(CommonUtils.LoggingLevels.Debug, undefined, fmt, ...args);

    this.fatal = (vlevel, fmt, ...args) => this._send_log_msg(CommonUtils.LoggingLevels.Fatal, vlevel, fmt, ...args);

    this.error = (fmt, ...args) => this._send_log_msg(CommonUtils.LoggingLevels.Error, undefined, fmt, ...args);

    this.warning = (fmt, ...args) => this._send_log_msg(CommonUtils.LoggingLevels.Warning, undefined, fmt, ...args);

    this.verbose = (vlevel, fmt, ...args) => this._send_log_msg(CommonUtils.LoggingLevels.Verbose, vlevel, fmt, ...args);

    this.info = (fmt, ...args) => this._send_log_msg(CommonUtils.LoggingLevels.Info, undefined, fmt, ...args);

    // private
    this._send_log_msg = (level, vlevel, fmt, ...args) => {
        const cpy = args;
        for (var idx = 0; idx < cpy.length; ++idx) {
            if (typeof cpy[idx] === 'object') {
                cpy[idx] = JSON.stringify(cpy[idx]);
            }
        }

        residue_native.write_log(this.id,
                                 CommonUtils.getSourceFile(5),
                                 CommonUtils.getSourceLine(5),
                                 CommonUtils.getSourceFunc(5),
                                 util.format(fmt, ...cpy),
                                 level,
                                 vlevel);
    }
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
exports.loadConfiguration = loadConfiguration;
exports.connect = connect;
exports.disconnect = residue_native.disconnect;
exports.isConnected = residue_native.is_connected;
exports.getLogger = (id) => (new Logger(id));
