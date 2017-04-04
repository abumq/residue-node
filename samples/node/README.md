                                       ‫بسم الله الرَّحْمَنِ الرَّحِيمِ

A very simple nodeJS app that uses [residue nodeJS client library](https://www.npmjs.com/package/residue)

### Pre-requisite
Make sure residue server is running. See [INSTALL.md](https://github.com/muflihun/residue/tree/master/docs/INSTALL.md) for instructions

### Run
```
cd ROOT/samples/node
npm install --save
cd ROOT/samples/node
npm install -g link
npm install --save
npm link {ROOT/src}
node app.js
```

`ROOT` above represent root directory for this git repo.

Once this sample app is running, direct your browser to `localhost:3009` or alternatively do `curl localhost:3009` and check your residue server or log file (By default, this will send logs to `/tmp/logs/sample-app.log`).
