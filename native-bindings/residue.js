
const util = require('util');
const residue_native = require('./build/Release/residue_native');

// Get location of callstack in <file>:<line> format
const getSourceLocation = (splitChar) => (new Error).stack.split('\n')[5].replace(' at ', '').trim().split(splitChar);

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

    this.info = (fmt, ...args) => {
        this._send_log_msg(residue_native.info, fmt, ...args);
    }

    this.debug = (fmt, ...args) => {
        this._send_log_msg(residue_native.debug, fmt, ...args);
    }

    // private
    this._send_log_msg = (fn, fmt, ...args) => {
        const cpy = args;
        for (var idx = 0; idx < cpy.length; ++idx) {
            if (typeof cpy[idx] === 'object') {
                cpy[idx] = JSON.stringify(cpy[idx]);
            }
        }

        fn(this.id, getSourceFile(), getSourceLine(), getSourceFunc(), util.format(fmt, ...cpy));
    }
};

exports.Residue = Residue;
exports.Logger = Logger;
