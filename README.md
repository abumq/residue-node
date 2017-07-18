                   ‫بسم الله الرَّحْمَنِ الرَّحِيمِ

# Residue NodeJS Client
A very simple, secure NodeJS library to interact with residue seamlessly.

This module provides interface for connecting and interacting with residue server seamlessly, means, once you are connected this module takes care of expired tokens and clients and keep itself updated with latest tokens and ping server when needed to stay alive.

[![Version](https://img.shields.io/npm/v/residue.svg)](https://www.npmjs.com/package/residue)

## Native API
This library depends on following native modules, without them library will not work:

 * [Crypto Module](https://nodejs.org/api/crypto.html)
 * [ZLib Module](https://nodejs.org/api/zlib.html)
 * [Net Module](https://nodejs.org/api/net.html)

## API
#### `connect(params)`
Connects application to residue using params

#### `getLogger(logger_id)`
Returns logger class for logging interface

## Sample
You can check out [sample client apps](https://github.com/muflihun/residue-node/blob/master/samples) for practical use of this package.
