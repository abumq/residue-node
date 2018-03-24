const residuenative = require('./build/Release/residuenative');

const Residue = function() {
    this.connect = (json) => {
        residuenative.connect(json);
    }
};

const Logger = function() {

};

exports.Residue = Residue;
exports.Logger = Logger;
