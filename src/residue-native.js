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

const Residue = function() {
    this.version = () => {
        return residue_native.version();
    }

    this.configure = (json) => {
        residue_native.configure(json);
    }

    this.connect = () => {
        residue_native.connect();
    }
};

const Logger = function(id) {
    this.id = id;

    this.trace = (fmt, ...args) => this._send_log_msg(residue_native.trace, CommonUtils.LoggingLevels.Trace, undefined, fmt, ...args);

    this.debug = (fmt, ...args) => this._send_log_msg(residue_native.debug, CommonUtils.LoggingLevels.Debug, undefined, fmt, ...args);

    this.fatal = (vlevel, fmt, ...args) => this._send_log_msg(residue_native.verbose, CommonUtils.LoggingLevels.Fatal, vlevel, fmt, ...args);

    this.error = (fmt, ...args) => this._send_log_msg(residue_native.error, CommonUtils.LoggingLevels.Error, undefined, fmt, ...args);

    this.warning = (fmt, ...args) => this._send_log_msg(residue_native.warning, CommonUtils.LoggingLevels.Warning, undefined, fmt, ...args);

    this.verbose = (vlevel, fmt, ...args) => this._send_log_msg(residue_native.verbose, CommonUtils.LoggingLevels.Verbose, vlevel, fmt, ...args);

    this.info = (fmt, ...args) => this._send_log_msg(residue_native.info, CommonUtils.LoggingLevels.Info, undefined, fmt, ...args);

    // private
    this._send_log_msg = (fn, level, vlevel, fmt, ...args) => {
        const cpy = args;
        for (var idx = 0; idx < cpy.length; ++idx) {
            if (typeof cpy[idx] === 'object') {
                cpy[idx] = JSON.stringify(cpy[idx]);
            }
        }

        fn(this.id, CommonUtils.getSourceFile(5), CommonUtils.getSourceLine(5), CommonUtils.getSourceFunc(5), util.format(fmt, ...cpy), level, vlevel);
    }
};

exports.Residue = Residue;
exports.Logger = Logger;
