# Change Log

## [2.3.4]
- Introduced native binding
- Added `version()` and `type()`

## [2.1.0]
- Private key uses hex

## [2.0.1]
- Compatibility with server 2.0.0

## [1.2.5]
- Removed plain request

## [1.2.4]
 - `loadConfiguration` now accepts object

## [1.2.1]
 - Included folders updated

## [1.2.0]
### Updates
- Support formatted logging

## [1.1.5]
### Fixes
- Do not send multiple touch requests when one is pending
- Crash when client is expired (#24)

### Updates
- License information update

## [1.1.4] - 06-10-2017
### Changes
- Display server version when connected

## [1.1.2] - 16-08-2017
### Changes
- Crypto API check
- Stable release

## [1.0.0-beta.16] - 15-08-2017
### Changes
- License added to the top of the file

## [1.0.0-beta.15] - 08-08-2017
### Changes
- Strict mode fix

## [1.0.0-beta.14] - 08-08-2017
### Changes
- Changed verbose signature from `msg, level` to `level, msg`
- Updated to use `requires_token` naming

## [1.0.0-beta.13] - 03-08-2017
### Update
- Changed licence to Apache 2.0

## [1.0.0-beta.11] - 03-08-2017
### Fixed
- Use of `CHECK_TOKENS` server flag to reduce overhead of pulling token when not needed
- Change ping to touch
- Re-estabilish connection if remote disconnected and dispatch all the logs
- Updated touch threshold to 2 minutes

## [1.0.0-beta.10]
### Fixed
- Fixed issue with token retrieving when client is dead
- Fixed issue with pinging client when `client_age` < 60
- Fixed issue with key when client created using different key size
- Fixed compression flag
- Fixed issue with token retrieving using default access code

## [1.0.0-beta.9]
### Fixed
- Use `path` module to resolve relative file paths

### Updates
- Use `crypto` module for RSA operations
- Ability to use encrypted private key
- Ability to specify public key for encrypted private keys

## [1.0.0-beta.7]
### Fixed
- Fixed log for generating key size
- Fixed issues with getting correct filename, line number and function name

### Added
- Added `loadConfiguration` to load configurations from json file

## [1.0.0-beta.6]
### Fixed
- Obtaining token race-condition issue #26
- Dead client not reconnecting #27
- Fixed `shouldSendPing()` calculations
- Fixed issue with verifying token with `0` life

### Changes
- Moved to separate repo
- Updated API to use configurations as C++ API

## [1.0.0-beta] - 31-03-2017
### Added
- Send server flags with final connection #14
- Support sending plain log requests in lib #13
- Support compression #19

### Changes
- Removed using `ripe` as backup
- Replaced `Logger` with `getLogger`

## [1.0.0-alpha] - 19-03-2017
### Changes
 - Initial release
