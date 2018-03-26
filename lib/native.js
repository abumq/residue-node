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

const fs = require('fs');
const path = require('path');
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
    this._send_log_msg = (fn, level, vlevel, fmt, ...args) => {
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
    if (typeof jsonOrFilename === 'object') {
        residue_native.configure(JSON.strigify(jsonOrFilename));
    } else if (typeof jsonOrFilename === 'string' && jsonOrFilename.length > 0) {
        if (jsonOrFilename.trim()[0] === '{') {
            residue_native.configure(jsonOrFilename.trim());
        } else {
            residue_native.configure(fs.readFileSync(path.resolve(jsonOrFilename), 'utf8'));
        }
    } else {
        console.log('Please select JSON or JSON filename that contains configurations');
        return false;
    }
    return true;
};

exports.loadConfiguration = loadConfiguration;
exports.connect = residue_native.connect;
exports.version = residue_native.version;
exports.getLogger = (id) => (new Logger(id));
