<p align="center">
  ﷽
</p>

A very simple nodeJS app that uses [residue Node.js client library](https://www.npmjs.com/package/residue)

### Pre-requisite
Make sure residue server is running (See [INSTALL.md](https://github.com/amrayn/residue/tree/master/docs/INSTALL.md) for instructions) or change client.conf.json to correct _url_.

Encryped key secret: `8583fFir`

### Run
```
npm install --save
npm install -g link
npm link ../../
node app.js
```

`ROOT` above represent root directory for this git repo.

Once this sample app is running, direct your browser to `localhost:3009` or alternatively do `curl localhost:3009` and check your residue server or log file (By default, this will send logs to `/tmp/logs/sample-app.log`).
