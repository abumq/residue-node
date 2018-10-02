﷽

# Residue Node.js Client

[![Build Status](https://img.shields.io/travis/muflihun/residue-node/master.svg)](https://travis-ci.org/muflihun/residue-node/branches)
[![Build status](https://ci.appveyor.com/api/projects/status/rp6ukh5apm5ryjxq?svg=true)](https://ci.appveyor.com/project/abumusamq/residue-node)
[![Version](https://img.shields.io/npm/v/residue.svg)](https://www.npmjs.com/package/residue)
[![GitHub license](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://github.com/muflihun/residue-node/blob/master/LICENSE)
[![Donate](https://img.shields.io/badge/Donate-PayPal-green.svg)](https://www.paypal.me/MuflihunDotCom/25)

Secure Node.js library to interact with residue server seamlessly.

This module provides interface for connecting and interacting with residue server seamlessly, means, once you are connected this module takes care of expired tokens and clients and keep itself updated with latest tokens and ping server when needed to stay alive.

## API
#### `connect(options)`
Connects application to residue using params. If options is not specified, you should use `loadConfiguration` to load the options

Valid options are:

```
{
    url: "<host_where_residue_server_is_listening>:<residue_connection_port>",
    application_id: <app_name [optional]>,
    rsa_key_size: <key_size_for_initial_final_key_transmission [optional]>,
    utc_time: <whether_to_use_UTC_time [optional]>,
    time_offset: <time_offset_in_seconds [optional]>,
    client_id: <client_id_that_server_knows_you_as [optional]>,
    client_private_key: <full_path_of_private_key> [must be provided with client_id],
    client_public_key: <full_path_of_public_key> [must be provided with client_id],
    client_key_secret: <base16 encoded secret (passphrase) for encrypted private key if any>,
    server_public_key: <full_path_of_server_public_key>
}
```

Please refer to [`loadConfiguration`](https://muflihun.github.io/residue/docs/class_residue.html#a8292657c93a775b6cbf22c6d4f1166f4) in our C++ library's documentation for more details.

#### `loadConfiguration(jsonFilename)`
Loads configurations / options via json file. Returns true if successfully loaded, otherwise false.

This does not verify the options. Options are validated in `connect()` function

#### `getLogger(logger_id)`
Returns logger class for logging interface

## Usage
```js
const ResidueClient = require('residue');

const residue = new ResidueClient();

const logger = residue.getLogger('sample-app');

const confFile = 'client.conf.json';
if (residue.loadConfiguration(confFile)) {
    residue.connect();
}

// or
// residue.loadConfiguration({ url: ... })
// or
// residue.loadConfiguration('{ url: ... }')

// ALTERNATIVELY
residue.connect({
    url: ...
});

logger.info('simple log');

logger.info('array %s', [1, 2, 3]);

var person = { 'name': 'Adam', 'age': 960, }
logger.info('obj %s', person);

logger.info('null %s', null);

logger.info('undefined %s', undefined);

```

## Log
```js
logger.info(...);
logger.warn(...);
logger.error(...);
logger.debug(...);
logger.trace(...);
logger.fatal(...);
logger.verbose(verbose_level, ...);
```

## Native Binding
Residue Node.js also comes with native binding that uses [C++ client library](https://github.com/muflihun/residue-cpp) to manage connections and asyncronous requests.

If you have installed [`residue-native`](https://www.npmjs.com/package/residue-native) package alongside `residue`, native binding will be used otherwise it will fallback to JS implementation.

## Sample
You can check out [sample client apps](https://github.com/muflihun/residue-node/blob/master/samples) for practical use of this package.

## License
```
Copyright 2017-present Muflihun Labs
Copyright 2017-present @abumusamq

https://github.com/muflihun/
https://muflihun.github.io/
https://muflihun.com/

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
