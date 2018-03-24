const residue = require('./residue');

const instance = new residue.Residue();

console.log(`Library version: ${instance.version()}`);

instance.connect('{"url":"residue-server:8777","application_id":"com.muflihun.residue.sampleapp","rsa_key_size":2048,"utc_time":false,"time_offset":0,"dispatch_delay":1,"main_thread_id":"MainThread","client_id":"muflihun00102030","client_private_key":"keys/muflihun00102030.pem"}');

const logger = new residue.Logger();

