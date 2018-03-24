const residue_native = require('./build/Release/residue_native');

const Residue = function() {
    this.version = () => {
        return residue_native.version();
    }

    this.connect = (json) => {
        residue_native.connect(json);
    }
};

const Logger = function() {

};

exports.Residue = Residue;
exports.Logger = Logger;
