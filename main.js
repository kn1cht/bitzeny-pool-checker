'use strict';
require('dotenv').config();
require('date-utils');
const config = require('config');
const cron = require('node-cron');
const https = require('https');
const portscanner = require('portscanner');
const twitter = require('twitter');
const util = require('util');

const MAX_RETRY = 3;
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
  const data = await new Promise((resolve) => {
    https.get(uri, (res) => {
      res.setEncoding('utf8');
      let body = '';
      res.on('data', (data) => { body += data; });
      res.on('end', () => { resolve({ body }); });   
    }).on('timeout', () => {
      resolve({ error : 'Timeout' });
    }).on('error', (err) => {
      console.debug(err);
    }).setTimeout(15000).end();
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
  const portStatus = await portscanner.checkPortStatus(port, { host, timeout : 1000 });
  return portStatus === 'open' ? true : false;
};

const postTweet = (status) => {
  bot.post('statuses/update', { status }, (err/*, tweet, response*/) => { 
    if (err) { console.error(err); } 
  }); 
};

const checkCurrentStatus = async() => {
  for(const pool of config.pools) {
    console.info(`[${new Date()}] Checking ${pool.name}...`);
    const previous = previousStatus[pool.id];
    const current = { api : false, stratum : false };
    for(let i = 0; i < MAX_RETRY; ++i) {
      current.api = await checkAPI(pool.url + config.apipath);
      if(current.api) { break; }
    }
    for(let i = 0; i < MAX_RETRY; ++i) {
      current.stratum = await checkStratum(pool.stratum.host, pool.stratum.port);
      if(current.stratum) { break; }
    }

    if(previous.api !== current.api || previous.stratum !== current.stratum) {
      previousStatus[pool.id] = { api : current.api, stratum : current.stratum };
      let text = '';
      if(!current.api || !current.stratum) { text += `【鯖落ち】「${pool.name}」に接続障害の可能性\n`; }
      else { text += `【復旧】「${pool.name}」が復帰しました\n`; }
      text += `${pool.url}\n`;
      text += `Webダッシュボード: ${current.api ? '\u2705 正常' : '\u26a0 停止'}\n`;
      text += `Stratumポート: ${current.stratum ? '\u2705 正常' : '\u26a0 停止'}\n`;
      text += `(${(new Date()).toFormat('YYYY/MM/DD HH24:MI:SS')} JST)\n`;
      text += '#bitzeny #ZNY';
      console.info(text);
      postTweet(text);
    }
  }
};

const tweetAllStatus = () => {
  let text = '【定期】プール稼働状況\n';
  for(const pool of config.pools) {
    const status = previousStatus[pool.id];
    text += `${pool.shortname || pool.name} `
    if(status.api && status.stratum) { text += '\u2705'; }
    else if(status.stratum) { text += '\u26a0(Web)'; }
    else if(status.api) { text += '\u26a0(Stratum)'; }
    else { text += '\u26a0(Web/Stratum)'; }
    text += `\n`; 
  }
  text += `(${(new Date()).toFormat('YYYY/MM/DD HH24:MI:SS')} JST)\n`;
  text += '#bitzeny #ZNY';
  console.info(text);
  postTweet(text);
}

cron.schedule('3-27,33-57/3 * * * *', () => { 
  checkCurrentStatus(); 
});

cron.schedule('0,30 * * * *', async() => {
  await checkCurrentStatus();
  tweetAllStatus();
});
