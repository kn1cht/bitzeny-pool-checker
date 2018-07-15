'use strict';
require('dotenv').config();
require('date-utils');
const config = require('config');
const cron = require('node-cron');
const portscanner = require('portscanner');
const request = require('request');
const text2png = require('text2png');
const twitter = require('twitter');

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

const MAX_RETRY = config.maxRetry;

const bot = new twitter ({
  consumer_key        : process.env.CONSUMER_KEY,
  consumer_secret     : process.env.CONSUMER_SECRET,
  access_token_key    : process.env.ACCESS_TOKEN,
  access_token_secret : process.env.ACCESS_TOKEN_SECRET
});

const previousStatus = {};
for(const pool of config.pools) {
  previousStatus[pool.id] = { api : true, stratum : true, hashRate : 0 };
}

/*** check MPOS API reachability ***/
const checkAPI = async(uri) => {
  const data = await new Promise((resolve) => {
    request.get(uri, { timeout : config.timeout.api || 1000 }, (error, response, body) => {
      if(error) { resolve({ error }); }
      else { resolve({ body }); }
    });
  });
  if(!data.error) {
    try {
      data.json = JSON.parse(data.body);
    } catch(err) {
      if(err.name === 'SyntaxError') { data.error = err.name; }
      else { console.error(err); }
    }
  }
  return data;
};

/*** check Stratum Port reachability ***/
const checkStratum = async(host, port) => {
  const portStatus = await portscanner.checkPortStatus(port, {
    host,
    timeout : config.timeout.stratum || 1000
  }).catch(err => {
    console.error(err);
    return false;
  });
  return portStatus === 'open' ? true : false;
};

const postTweet = async(status, media) => {
  if(process.env.DEBUG) { return; }
  if(media) {
    bot.post('media/upload', { media }, (err, res) => {
      if (err) { console.error(err); }
      const mediaIds = res.media_id_string;
      bot.post('statuses/update', { status, media_ids : mediaIds }, (err) => {
        if (err) { console.error(err); }
      });
    });
  }
  else {
    bot.post('statuses/update', { status }, (err/*, tweet, response*/) => {
      if (err) { console.error(err); }
    });
  }
};

const checkCurrentStatus = async() => {
  for(const pool of config.pools) {
    console.info(`[${new Date()}] Checking ${pool.name}...`);
    const prevStatus = previousStatus[pool.id];
    const status = { api : false, stratum : false, hashRate : 0 };

    for(let retry = 0; retry < MAX_RETRY; ++retry) {
      const api = await checkAPI(pool.url + (config.apiPath[pool.type]));
      if(api.error) { continue; }
      status.api = true;
      if(pool.type === 'mpos') {
        status.hashRate = api.json.hashrate; // [kH/s]
      }
      else if(pool.type === 'nomp') {
        status.hashRate = api.json.algos.yescrypt.hashrate / 1e3; // [kH/s]
      }
      break;
    }
    for(let retry = 0; retry < MAX_RETRY; ++retry) {
      status.stratum = await checkStratum(pool.stratum.host, pool.stratum.port);
      if(status.stratum) { break; }
    }

    if(prevStatus.api !== status.api || prevStatus.stratum !== status.stratum) {
      let text = '';
      if(!status.api || !status.stratum) { text += `【鯖落ち】「${pool.name}」に接続障害の可能性\n`; }
      else { text += `【復旧】「${pool.name}」が復帰しました\n`; }
      text += `${pool.url}\n`
            + `Webダッシュボード: ${status.api ? '\u2705 正常' : '\u26a0 停止'}\n`
            + `Stratumポート: ${status.stratum ? '\u2705 正常' : '\u26a0 停止'}\n`
            + `(${(new Date()).toFormat('YYYY/MM/DD HH24:MI:SS')} JST)\n`;
      console.info(text);
      if(!pool.alert_disabled) { postTweet(text); }
    }
    previousStatus[pool.id] = status;
  }
};

const tweetAllStatus = () => {
  let text = '【定期】プール稼働状況\n';
  const okPools = [];
  const allHashRate = config.pools.reduce((sum, pool) => {
    if(!(previousStatus[pool.id]).hashRate) { return sum; }
    return sum + (previousStatus[pool.id]).hashRate;
  }, 0);

  for(const pool of config.pools) {
    const status = previousStatus[pool.id];
    if(status.api && status.stratum) { okPools.push(pool.name); }
    else {
      text += `\u26a0 ${pool.shortname || pool.name}`;
      if(status.stratum) {
        text += '(Web)\n';
      }
      else if(status.api) {
        text += '(Stratum)\n';
      }
      else {
        text += '(Web/Stratum)\n';
      }
    }
    const prop = 1e2 * status.hashRate / allHashRate;
    if(prop >= config.hashPowerWarn) {
      text += `\u2757 ${pool.shortname || pool.name}にハッシュパワーが集中しています`
            + `(${prop.toFixed(1)}%)。分散しましょう！\n`;
    }
  }
  if(okPools.length === config.pools.length) { text += '全プールが正常です！\ud83c\udf8a\n'; }
  else { text += `その他${okPools.length}プールが正常\n`; }
  text += `(${(new Date()).toFormat('YYYY/MM/DD HH24:MI:SS')} JST)\n#BitZeny`;
  console.info(text);

  let imageText = `【${okPools.length}プールが正常稼働中】\n`;
  for(const name of okPools) { imageText += ` ・${name}\n`; }
  imageText += `(${(new Date()).toFormat('YYYY/MM/DD HH24:MI:SS')} JST @bitzenypoolbot)\n`;

  const image = text2png(imageText, {
    localFontPath : 'font/ipagp.ttf',
    lineSpacing   : 10,
    bgColor       : 'white'
  });
  postTweet(text, image);
};

if(process.env.DEBUG) {
  (async() => {
    await checkCurrentStatus();
    tweetAllStatus();
  })();
}
else {
  cron.schedule('*/5 * * * *', () => {
    checkCurrentStatus();
  });

  cron.schedule('0 0-23/3 * * *', async() => {
    tweetAllStatus();
  });
}
