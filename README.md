# bitZeny Pool Checker [![Build Status](https://travis-ci.org/kn1cht/bitzeny-pool-checker.svg?branch=master)](https://travis-ci.org/kn1cht/bitzeny-pool-checker) [![Greenkeeper badge](https://badges.greenkeeper.io/kn1cht/bitzeny-pool-checker.svg)](https://greenkeeper.io/)
Check whether bitZeny mining pools is up and share information on Twitter.

Account: [bitzenypoolbot](https://twitter.com/bitzenypoolbot)

Explanation(日本語): [BitZenyマイニングプールの死活監視をするTwitter Bot](https://qiita.com/kn1cht/items/34eecc0d5728e350250d)

## Usage
```bash
git clone https://github.com/kn1cht/bitzeny-pool-checker.git
npm i
cp .env.example .env
vi .env
node main.js
```

Use [`forever`](https://github.com/foreverjs/forever) to run in background.

## Debug
```bash
DEBUG=1 node main.js
```

