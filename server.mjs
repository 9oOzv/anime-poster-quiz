import bodyParser from 'body-parser';
import express from 'express';
import http from 'http';
import path from 'path';
import yargs from 'yargs';
import { Client, Game } from './game.mjs';
import { WebSocketServer } from 'ws';
import { getLog, configLog } from './log.mjs';

const __dirname = import.meta.dirname;


const app = express();
const server = http.createServer(app);;
const log = getLog('apq');


function parseFilterString(filterString) {
  const regex = /(\w+)\(([^)]*)\);?/g;
  let match;
  const result = [];
  while ((match = regex.exec(filterString)) !== null) {
      const functionName = match[1];
      const argStr = match[2];
      const args = JSON.parse(`[${argStr}]`);
      result.push({ name: functionName, enabled: true, args: args });
  }
  return result;
}

async function serve(options) {
  const logLevel =
    options.trace
    ? 'trace' : options.debug
    ? 'debug' : 'info';
  configLog('apq', logLevel);
  log.debug({ options });
  options.gameConfig.filters = parseFilterString(options.filters);
  const game = new Game(
    options.adminConfig,
    options.gameConfig
  );
  game.run();
  app.use(bodyParser.json());
  app.use('/static', express.static(path.join(__dirname, 'public')));
  app.get('/', (_, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html')
    log.trace({ indexPath });
    res.sendFile(indexPath);
  });
  app.get('/configure', (_, res) => {
    const htmlPath = path.join(__dirname, 'public', 'config.html')
    log.trace({ htmlPath });
    res.sendFile(htmlPath);
  });
  app.get('/configuration', (_, res) => {
    const config = game.configuration;
    log.trace({ config });
    res.json(config);
  });
  app.post('/configuration', async (req, res) => {
    const data = req.body;
    log.trace({ data });
    game.configure(data.config, data.immediate)
      .then(() => res.json({ status: 'success' }))
      .catch(err => {
        log.error('Configuration failed');
        log.error(err);
        res.json({ status: 'failed', message: 'Configuration failed'});
      });
  });
  const wss = new WebSocketServer({server: server, path: "/ws"});
  wss.on(
    "connection",
    (ws) => game.addClient(new Client(ws))
  );
  server.listen(options.port, () => {
    log.info({ port: options.port });
  });
}


yargs(process.argv.slice(2))
  .scriptName("anime-poster-quiz")
  .usage('$0 <cmd> [args]')
  .command('serve', 'Serve', (yargs) => {
    yargs.option('port', {
        alias: 'p',
        default: process.env.PORT ?? 3000,
        describe: 'Data from AniList',
        type: 'string'
    })
    .option('media-data', {
        alias: 'd',
        default: 'media.json',
        describe: 'Data from AniList',
        type: 'string'
    })
    .option('dummy-media-data', {
        alias: 'dd',
        default: false,
        describe: 'Use dummy media data instead of loading from file',
        type: 'boolean'
    })
    .option('reveal-interval', {
        alias: 'ri',
        default: 5000,
        describe: 'Poster reveal interval in milliseconds',
        type: 'number'
    })
    .option('results-time', {
        alias: 'rt',
        default: 10000,
        describe: 'Result screen time in milliseconds',
        type: 'number'
    })
    .option('reset-time', {
        alias: 'reset',
        default: 1000,
        describe: 'Additional wait between results and "reset". Not very important',
        type: 'number'
    })
    .option('short-wait', {
        default: 200,
        describe: 'Shortest wait between phases. Maybe used in various places to prevent problems from network latency.',
        type: 'number'
    })
    .option('default-wait', {
        default: 1000,
        describe: 'Just another wait to be used when there is no other appropriate setting',
        type: 'number'
    })
    .option('min-circle-size', {
        alias: 'min-cs', default: 0.01,
        describe: 'Minimum reveal circle radius. As a fraction of max(<image width>, <image height>)',
        type: 'number'
    })
    .option('max-circle-size', {
        alias: 'max-cs',
        default: 0.1,
        describe: 'Minimum reveal circle radius. As a fraction of max(<image width>, <image height>)',
        type: 'number'
    })
    .option('num-circles', {
        alias: 'nc',
        default: 10,
        describe: 'Number of circles to reveal',
        type: 'number'
    })
    .option('filters', {
        alias: 'f',
        default: '',
        describe: 'Add filters. Format as "filter1Name(a,b,c);filter2Name(d,e,f);..."',
        type: 'string'
    })
    .option('debug', {
        default: process.env.DEBUG ? true: false,
        describe: 'Debug logging',
        type: 'boolean'
    })
    .option('trace', {
        default: process.env.TRACE ? true: false,
        describe: 'Trace logging',
        type: 'boolean'
    })
  },
  function (argv) {
    serve(
      {
        adminConfig: {
          mediaDataPath: argv.dummyMediaData ? null : argv.mediaData
        },
        gameConfig: {
          revealWait: argv.revealInterval,
          resultWait: argv.resultsTime,
          resetWait: argv.resetTime,
          shortWait: argv.shortWait,
          numCircles: argv.numCircles,
          circleSize: [ argv.minCircleSize, argv.maxCircleSize ],
        },
        filters: argv.filters,
        port: argv.port,
        debug: argv.debug,
        trace: argv.trace
      }
    )
  })
  .help()
  .parse()

