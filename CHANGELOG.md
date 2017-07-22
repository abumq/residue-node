# Change Log

## [1.0.0-beta.8]
### Fixed
- Use `path` module to resolve relative file paths

### Updates
- Use `crypto` module for RSA operations
- Ability to use encrypted private key

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
