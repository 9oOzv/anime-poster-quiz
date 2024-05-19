import express from 'express';
import path from 'path';
import bodyParser from 'body-parser';
import { promises as fs } from 'fs';
import { FilterCollection } from './filters.mjs';
import { compare, sleep } from './utils.mjs';
import { exampleMediaData } from './example-data.mjs';
import yargs from 'yargs';
import http from 'http';
import { WebSocketServer } from 'ws';
import { MediaCollection } from './mediacollection.mjs';
import { HintImage } from './hintimage.mjs';
import { getLog, configLog } from './log.mjs';
const __dirname = import.meta.dirname;


const app = express();
const server = http.createServer(app);;

const log = getLog('apq');


class GameError extends Error {
  constructor(message) {
    super(message)
    this.name = 'GameError'
    Error.captureStackTrace(this, GameError);
  }
}

class Game {
  #config = {
    messageWait: 10000,
    revealWait: 5000,
    resultWait: 10000,
    resetWait: 1000,
    shortWait: 200,
    numCircles: 20,
    circleSizeMin: 0.02,
    circleSizeMax: 0.1,
    filters: []
  };
  #adminConfig = {
    mediaDataPath: 'media.json'
  };
  #id;
  #mediaData;
  #answers;
  #results;
  hintImage;
  #currentMedia;
  #start;
  #phase;
  #wait;
  #mediaCollection;
  messages;
  #newConfig;
  #clients;

  constructor(adminConfig, gameConfig) {
    log.debug({ this: this, adminConfig, gameConfig });
    const id = Date.now().toString(36);
    this.#id = id;
    this.#adminConfig = adminConfig;
    this.#clients = new Set();
    this.setGameConfig(gameConfig);
  }

  setGameConfig(config) {
    log.info({ this: this, config });
    for(const [k, v] of Object.entries(config)) {
      this.#config[k] = v;
    }
    log.debug({ this: this, config: this.#config });
  }

  async init() {
    this.#config = this.#newConfig ?? this.#config
    this.#newConfig = null;
    this.#mediaData = await this.loadData();
    this.#mediaCollection = new MediaCollection(this.#mediaData);
    const filterCollection = new FilterCollection(this.#config.filters);
    this.#mediaCollection.setFilters(filterCollection);
    this.#mediaData = [];
    this.#answers = {};
    this.#results = {};
    this.hintImage = null
    this.#currentMedia = null;
    this.#start = null;
    this.#phase = '';
    this.#wait = 0;
  }

  initClient(client)  {
    log.info({ this: this, client });
    client.game = this;
    client.sendCommand('completions', this.completions);
  }

  removeClient(client) {
    log.info({ this: this, client });
    this.#clients.delete(client);
  }

  addClient(client) {
    log.info({ this: this, client });
    this.#clients.add(client)
    this.initClient(client);
  }

  clientCommand(client, command, ...args) {
    if (command == 'answer') {
      this.submitAnswer(...args)
    }
  }

  async loadData() {
    const mediaDataPath = this.#adminConfig.mediaDataPath;
    if (!mediaDataPath) {
      log.info({ this: this, exampleMediaData });
      return exampleMediaData;
    }
    return await fs.readFile(this.#adminConfig.mediaDataPath, 'utf8')
      .then(JSON.parse)
      .catch(
        error => {
          log.error({ this: this, path: this.#adminConfig.mediaDataPath, error: error });
          log.error({ this: this, exampleMediaData });
          return exampleMediaData;
        }
      );
  }

  sendCommands(command, ...args) {
    log.info({ this: this, numClients: this.#clients.size, command});
    this.#clients.forEach(c => c.sendCommand(command, ...args));
  }

  async doRevealAll() {
    log.info({ this: this });
    await this.hintImage.revealAll();
    this.sendCommands('showImage', this.hintJpeg.toString('base64'));
    this.#phase = 'reveal';
    this.#wait = this.#config.revealWait;
    return;
  }

  async doRevealMore() {
    log.info({ this: this });
    await this.hintImage.revealCircle(
      this.#config.circleSizeMin,
      this.#config.circleSizeMax
    )
    this.sendCommands('showImage', this.hintJpeg.toString('base64'));
    this.#wait = this.#config.revealWait;
    return;
  }

  doResults() {
    log.info({ this: this });
    const results
      = this.#results
      = this.#answers;
    this.sendCommands('showResults', results);
    this.#phase = 'results';
    this.#wait = this.#config.resultWait;
    return;
  }

  async doReset() {
    log.info({ this: this });
    if(this.#newConfig) {
      await this.init();
      return;
    }
    this.sendCommands('reset');
    await this.newQuestion();
    this.#phase = 'guessing';
    this.#wait = this.#config.shortWait;
    return;
  }

  async doMessage(messages, errors) {
    log.info({ this: this, messages, errors });
    errors ??= [];
    errors = (Array.isArray(errors)) ? errors : [ errors ]
    messages ??= [];
    messages = (Array.isArray(messages)) ? messages : [ messages ]
    this.messages = [
      ...messages.map(m => ({ text: m, classes: 'good'})),
      ...errors.map(m => ({ text: m, classes: 'bad'}))
    ];
    this.sendCommands('showMessages', this.messages);
    this.#phase = 'message';
    this.#wait = this.#config.messageWait;
    return;
  }

  async doStuff() {
    if (this.#phase == 'guessing') {
      if (this.hintImage.numCircles >= this.#config.numCircles) {
        return this.doRevealAll();
      } else {
        return this.doRevealMore();
      }
    }
    if (this.#phase == 'reveal') {
      return this.doResults();
    }
    return this.doReset();
  }


  async doError(error) {
        if(error instanceof GameError) {
          log.error({ this: this, err: error });
          await this.doMessage(null, error.message);
        } else {
          log.error({ this: this, err: error });
          await this.doMessage(null, 'Something unexpected happened. Restarting.');
        }
  }

  async run() {
    while(true) {
      log.trace({ this: this, phase: this.#phase });
      await this.doStuff()
        .catch(error => this.doError(error));
      log.trace({ this: this, phase: this.#phase, wait: this.#wait });
      await sleep(this.#wait);
    }
  }

  async newQuestion() {
    this.#start = Date.now();
    const media
      = this.#currentMedia
      = this.#mediaCollection.random();
    if(!media) {
      throw new GameError('Could not load media. Maybe a configuration/filter problem?');
    }
    log.info({ this: this, media: media.info });
    this.hintImage = new HintImage(await media.image());
    this.#answers = {};
    this.#answers['CORRECT ANSWER'] = {
      answer: media.displayAnswer,
      correct: true,
      time: 0
    }
  }

  get hintJpeg() {
    return this.hintImage.jpeg;
  }

  submitAnswer(player, answer) {
    log.info({ this:this, player, answer });
    const accepted = this.#currentMedia.answers;
    this.#answers[player] = {
      answer: answer,
      correct: accepted.some(a => compare(a, answer)),
      time: Date.now() - this.#start
    };
  }

  get completions() {
    log.debug({ this: this });
    log.trace({ this: this, mediaCollection: this.#mediaCollection });
    return this.#mediaCollection.completions();
  }

  get configuration() {
    return this.#config;
  }

  async configure(config, immediate = false) {
    log.info({ this: this, config, immediate })
    this.#newConfig = config;
    if(immediate) {
      this.#phase = '';
    }
  }

}


function parseFilterString(filterString) {
  const regex = /(\w+)\(([^)]*)\);?/g;
  let match;
  const result = [];
  while ((match = regex.exec(filterString)) !== null) {
      const functionName = match[1];
      const argStr = match[2];
      const args = JSON.parse(`[${argStr}]`);
      result.push({ name: functionName, args: args });
  }
  return result;
}


class Client {

  #ws;

  constructor(ws) {
    log.info({ this: this });
    this.id = Date.now().toString(36);
    this.#ws = ws;
    this.#ws.on('message', (event) => this.onMessage(event.data));
    this.#ws.on('close', () => this.game && this.game.removeClient(this));
    this.game = null;
    log.info({ this: this });
  }

  sendCommand(command, ...args) {
    this.#ws.send(JSON.stringify({ command: command, args: args }));
  }

  onMessage(json) {
    data = JSON.parse(json);
    const command = data.command;
    const args = data.args;
    game.clientCommand(command, args);
  }
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
  await game.init();
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
          circleSizeMin: argv.minCircleSize,
          circleSizeMax: argv.maxCircleSize
        },
        filters: argv.filters,
        port: argv.port,
      }
    )
  })
  .help()
  .parse()

