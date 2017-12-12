'use strict';
require('dotenv').config();
const config = require('config');
const cron = require('node-cron');
const https = require('https');
const portscanner = require('portscanner');
const twitter = require('twitter');
const util = require('util');
const bot = new twitter ({
  consumer_key        : process.env.CONSUMER_KEY,
  consumer_secret     : process.env.CONSUMER_SECRET,
  access_token_key    : process.env.ACCESS_TOKEN,
  access_token_secret : process.env.ACCESS_TOKEN_SECRET
});

const previousStatus = {};
for(const pool of config.pools) {
  previousStatus[pool.id] = { api : true, stratum : true };
}

/*** check MPOS API reachability ***/
const checkAPI = async(uri) => {
  console.info(uri);
  const data = await new Promise((resolve) => {
    https.get(uri, (res) => {
      res.setEncoding('utf8');
      let body = '';
      res.on('data', (data) => { body += data; });
      res.on('end', () => { resolve({ body }); });   
    }).on('timeout', () => {
      resolve({ error : 'Timeout' });
    }).on('error', (err) => {
      console.error(err);
    }).setTimeout(30000).end();
  });
  if(!data.error) {
    try {
      data.json = JSON.parse(data.body);
    } catch(err) {
      if(err.name === 'SyntaxError') { data.error = err.name; }
      else { console.error(err); }
    }
  }
  if(data.error) { return false; }
  return true;
};

/*** check Stratum Port reachability ***/
const checkStratum = async(host, port) => {
  const portStatus = await util.promisify(portscanner.checkPortStatus)(port, host);
  return portStatus === 'open' ? true : false;
};

const postTweet = (status) => {
  console.info(status);
  bot.post('statuses/update', { status }, (err/*, tweet, response*/) => { 
    if (err) { console.error(err); } 
  });
};

const main = async() => {
  for(const pool of config.pools) {
    const previous = previousStatus[pool.id];
    const api = await checkAPI(pool.url + config.apipath);
    const stratum = await checkStratum(pool.stratum.host, pool.stratum.port);
    if(previous.api !== api || previous.stratum !== stratum) {
      previousStatus[pool.id] = { api, stratum };
      let text = '';
      if(!api || !stratum) { text += `【鯖落ち】「${pool.name}」に接続障害の可能性\n`; }
      else { text += `【復旧】「${pool.name}」が復帰しました\n`; }
      text += `Webダッシュボード: ${api ? '\u2705 正常' : '\u26a0 停止'}\n`;
      text += `Stratumポート: ${stratum ? '\u2705 正常' : '\u26a0 停止'}\n`;
      text += '#bitzeny #ZNY';
      postTweet(text);
    }
  }
};

cron.schedule('0-59/5 * * * *', () => { main(); });
