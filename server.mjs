import express from 'express';
import path from 'path';
import bodyParser from 'body-parser';
import { loadImage, createCanvas } from 'canvas';
import { promises as fs } from 'fs';
import {
  createContextLogger,
  ERROR,
  WARNING,
  INFO,
  NOTICE,
  VERBOSE,
  DEBUG,
  TRACE
} from './logging.mjs';
import { FilterCollection } from './filters.mjs';
import { compare, sleep, normalizeString } from './utils.mjs';
import { exampleMediaData } from './example-data.mjs';
import yargs from 'yargs';
const __dirname = import.meta.dirname;

const logger = createContextLogger('server');

const app = express();


class GameError extends Error {
  constructor(message) {
    super(message)
    this.name = 'GameError'
    Error.captureStackTrace(this, GameError);
  }
}


function dummyImage(){
    return createCanvas(10, 10).createJPEGStream();
}



class HintImage {
  #circles = [];
  #jpegStream;
  #image;

  constructor(image) {
    this.#image = image;
  }

  createRandomCircle(width, height, minRadius = 0, maxRadius = 1) {
    const radiusFrac = minRadius + Math.random() * (maxRadius - minRadius);
    const radius = radiusFrac * Math.max(width, height);
    const x = Math.random() * (width - 2 * radius) + radius;
    const y = Math.random() * (height - 2 * radius) + radius;
    return { x, y, radius };
  }

  async revealCircle(minRadius, maxRadius) {
    this.#circles.push(
      this.createRandomCircle(
        this.width,
        this.height,
        minRadius,
        maxRadius
      )
    );
    this.revealCircles();
  }

  async revealCircles() {
    const canvas = this.blackCanvas(
      this.width,
      this.height
    );
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = ctx.createPattern(
      await this.#image,
      "repeat"
    );
    this.#circles.forEach(circle => {
      ctx.beginPath();
      ctx.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2);
      ctx.fill();
    });
    this.#jpegStream = canvas.createJPEGStream();
  }

  async revealAll() {
    const canvas = this.blackCanvas(
      this.width,
      this.height
    )
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = ctx.createPattern(this.#image, "repeat");;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.#jpegStream = canvas.createJPEGStream();
  }

  blackCanvas(w, h) {
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, w, h);
    return canvas;
  }

  get jpegStream() {
    return this.#jpegStream;
  }

  get width() {
    return this.#image.width;
  }

  get height() {
    return this.#image.height;
  }

  get numCircles() {
    return this.#circles.length;
  }

}


class Media {

  #image;
  #data;
  #answers;

  constructor(data) {
    this.#data = data;
  }

  get answers() {
    return this.#answers ??= [
      this.#data.title.english,
      this.#data.title.romaji,
      this.#data.title.native,
      ...this.synonyms,
      ...this.hashtags
    ].filter(a => a !== null);
  }

  get synonyms() {
    return this.#data.synonyms ?? [];
  }

  get hashtags() {
    return (this.#data.hashtag ?? '').split(/ +/);
  }

  get normalizedCompletions() {
    return new Map(
      this.answers.map(a => [ normalizeString(a), a ])
    );
  }

  get displayAnswer() {
    return [
      this.#data.title.romaji,
      this.#data.title.english,
      this.#data.title.native
    ].join(' | ');
  }
  
  async image() {
    return this.#image ??= loadImage(
      this.#data.coverImage.extraLarge
    );
  }

  get info() {
    return this.#data;
  }

}


class MediaCollection {

  #id;
  #data;
  #filterCollection;
  #completions;
  #medias;

  constructor(mediaData) {
    const id = Date.now().toString(36);
    this.logger = createContextLogger('MediaCollection', { mediaCollectionId: id });
    this.#id = id;
    TRACE(this, 'Creating MediaCollection', { mediaData });
    this.#data = mediaData;
    this.createMedias(this.#data);
  }

  createMedias() {
    INFO(this, 'Creating medias', { mediaDataLength: this.#data.length });
    TRACE(this, 'Creating medias', {});
    var fc
    const filteredData = (fc = this.#filterCollection) ?
      fc.filter(this.#data)
      : this.#data;
    INFO(this, 'Filtered medias', { filteredDataLength: this.#data.length });
    TRACE(this, 'Filtered data', { filteredDataLength: filteredData.length });
    this.#medias = filteredData.map(m => new Media(m));
    this.#completions = null;
  }

  setFilters(filterCollection) {
    this.#filterCollection = filterCollection;
    this.createMedias();
  }

  generateCompletions() {
    const completions = [
      ...new Map(
        new Array().concat(
          ...this.#medias.map(
            m => [ ...m.normalizedCompletions ]
          )
        )
      )
    ].map(v => v[1]);
    TRACE(this, 'Generated completions', { completions });
    return completions
  }

  completions() {
    INFO('Completions');
    return this.#completions ??= this.generateCompletions();
  }

  random() {
    return this.#medias[
      Math.floor(
        Math.random() * this.#medias.length
      )
    ];
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
  #nextHintListeners;
  #resultListeners;
  #resetListeners;
  #logger;
  messages;
  #newConfig;

  constructor(adminConfig, gameConfig) {
    DEBUG(this, 'Creating new game', { adminConfig, gameConfig });
    const id = Date.now().toString(36);
    this.logger = createContextLogger('Game', { gameId: id });
    this.#id = id;
    this.adminConfig = adminConfig;
    this.setGameConfig(gameConfig);
  }

  setGameConfig(config) {
    INFO(this, 'Setting game options', { config });
    for(const [k, v] of Object.entries(config)) {
      this.#config[k] = v;
    }
    DEBUG(this,'New config', { config: this.#config });
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
    this.initListeners();
  }

  initListeners() {
    let resetListeners = this.#resetListeners ?? [];
    let resultListeners = this.#resultListeners ?? [];
    let nextHintListeners = this.#nextHintListeners ?? [];
    this.#resetListeners = [];
    this.#resultListeners = [];
    this.#nextHintListeners = [];
    resetListeners.forEach(f => f());
    nextHintListeners.forEach(f => f(dummyImage()));
    resultListeners.forEach(f => f({}));
  }

  async loadData() {
    return await fs.readFile(this.#adminConfig.mediaDataPath, 'utf8')
      .then(JSON.parse)
      .catch(
        error => {
          ERROR(this, 'Could not load data', { path: this.#adminConfig.mediaDataPath, error: error });
          ERROR(this, 'Loading example media', { exampleMediaData });
          return exampleMediaData;
        }
      );
  }

  async doRevealAll() {
    INFO(this, 'Revealing all')
    await this.hintImage.revealAll();
    const listeners = this.#nextHintListeners;
    this.#nextHintListeners = [];
    this.#phase = 'reveal';
    VERBOSE(this, 'Sending image', { listeners: listeners.length });
    listeners.forEach(
      f => f(this.hintJpegStream)
    );
    this.#wait = this.#config.revealWait;
    return;
  }

  async doRevealMore() {
    INFO(this, 'Revealing more')
    await this.hintImage.revealCircle(
      this.#config.circleSizeMin,
      this.#config.circleSizeMax
    )
    const listeners = this.#nextHintListeners;
    this.#nextHintListeners = [];
    VERBOSE(this, 'Sending image', { listeners: listeners.length });
    listeners.forEach(f => f(this.hintJpegStream));
    this.#wait = this.#config.revealWait;
    return;
  }

  doResults() {
  INFO(this, 'Showing results');
    const results
      = this.#results
      = this.#answers;
    const listeners = this.#resultListeners;
    this.#resultListeners = [];
    this.#phase = 'results';
    VERBOSE(this, 'Sending results', { listeners: listeners.length });
    listeners.forEach(f => f(results));
    this.#wait = this.#config.resultWait;
    return;
  }

  async doReset() {
    INFO(this, 'Resetting');
    if(this.#newConfig) {
      await this.init();
      return;
    }
    const listeners = this.#resetListeners;
    this.#resetListeners = [];
    this.#phase = 'guessing';
    VERBOSE(this, 'Sending resets', { listeners: listeners.length });
    listeners.forEach(f => f());
    await this.newQuestion();
    this.#wait = this.#config.shortWait;
    return;
  }

  async doMessage(messages, errors) {
    INFO(this, 'Sending a message', { messages, errors });
    this.#resetListeners.forEach(f => f());
    this.#nextHintListeners.forEach(f => f(dummyImage()));
    this.#resultListeners.forEach(f => f({}));
    errors ??= [];
    errors = (Array.isArray(errors)) ? errors : [ errors ]
    messages ??= [];
    messages = (Array.isArray(messages)) ? messages : [ messages ]
    this.messages = [
      ...messages.map(m => ({ text: m, classes: 'good'})),
      ...errors.map(m => ({ text: m, classes: 'bad'}))
    ];
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
          ERROR(this, error);
          await this.doMessage(null, error.message);
        } else {
          ERROR(this, error);
          await this.doMessage(null, 'Something unexpected happened. Restarting.');
        }
  }

  async run() {
    while(true) {
      TRACE(this, 'Run start', { phase: this.#phase });
      await this.doStuff()
        .catch(error => this.doError(error));
      TRACE(this, 'Run end', { phase: this.#phase, wait: this.#wait } );
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
    INFO(this, 
      'Selected new poster',
      { media: media.info }
    )
    this.hintImage = new HintImage(await media.image());
    this.#answers = {};
    this.#answers['CORRECT ANSWER'] = {
      answer: media.displayAnswer,
      correct: true,
      time: 0
    }
  }

  async nextHintJpegStream() {
    const listeners = this.#nextHintListeners;
    return new Promise((resolve) => listeners.push(resolve));
  }

  get hintJpegStream() {
    return this.hintImage.jpegStream;
  }

  async reset() {
    const listeners = this.#resetListeners;
    return new Promise((resolve) => listeners.push(resolve));
  }

  async nextResults() {
    const listeners = this.#resultListeners;
    return new Promise((resolve) => listeners.push(resolve));
  }

  get results() {
    return this.#results;
  }

  submitAnswer(player, answer) {
    INFO(this, `Received answer`, { player, answer });
    const accepted = this.#currentMedia.answers;
    this.#answers[player] = {
      answer: answer,
      correct: accepted.some(a => compare(a, answer)),
      time: Date.now() - this.#start
    };
  }

  next() {
    if(this.#phase === 'reveal') {
      return { action: 'results' };
    }
    if(this.#phase === 'results'){
      return { action: 'reset' };
    }
    if(this.#phase === 'message'){
      return { action: 'message' };
    }
    return { action: 'image' };
  }

  completions() {
    DEBUG(this, 'Completions', { });
    TRACE(this, 'Completions', { mediaCollection: this.#mediaCollection });
    return this.#mediaCollection.completions();
  }

  get configuration() {
    return this.#config;
  }

  async configure(config, immediate = false) {
    INFO(this, 
      'Set new configuration',
      { config, immediate }
    )
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


async function serve(options) {
  DEBUG(logger, 'Serve option', { options });
  options.gameConfig.filters = parseFilterString(options.filters);
  const game = new Game(
    options.adminConfig,
    options.gameConfig
  );
  await game.init();
  game.run();
  app.use(bodyParser.json());
  app.use('/static', express.static(path.join(__dirname, 'public')));
  app.get('/next.jpg', async (_, res) => {
    const stream = await game.nextHintJpegStream();
    TRACE(logger, 'Responding to `next.jpg`', { typeofStream: typeof(stream) });
    stream.pipe(res);
  });
  app.get('/current.jpg', async (_, res) => {
    const stream = (await game.hintJpegStream).pipe(res);
    TRACE(logger, 'Responding to `current.jpg`',{ typeofStream: typeof(stream) });
  });
  app.get('/', (_, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html')
    TRACE(logger, 'Responding to `/`', { indexPath });
    res.sendFile(indexPath);
  });
  app.get('/next', (_, res) => {
    const data = game.next();
    TRACE(logger, 'Responding to `/next`', { data });
    res.json(data);
  });
  app.get('/completions', (_, res) => {
    const data = game.completions();
    TRACE(logger, 'Responding to `/completions`', { data });
    res.json(data);
  });
  app.post('/submit', (req, res) => {
    const { nickname, answer } = req.body;
    game.submitAnswer(nickname, answer);
    const data = { status: 'success' }
    TRACE(logger, 'Responding to `/submit`', { data, nickname, answer, });
    res.json(data);
  });
  app.get('/reset', async (_, res) => {
    const data = await game.reset();
    TRACE(logger, 'Responding to `/reset`', { data });
    res.json(data);
  });
  app.get('/results', async (_, res) => {
    const data = await game.nextResults();
    TRACE(logger, 'Responding to `/results`', { data });
    res.json(data);
  });
  app.get('/message', async (_, res) => {
    const data = {
      status: 'success',
      data: {
        messages: game.messages,
      }
    };
    TRACE(logger, 'Responding to `/message`', { data });
    res.json(data);
  });
  app.get('/configure', (_, res) => {
    const htmlPath = path.join(__dirname, 'public', 'config.html')
    TRACE(logger, 'Responding to `/configure`', { htmlPath });
    res.sendFile(htmlPath);
  });
  app.get('/configuration', (_, res) => {
    const config = game.configuration;
    TRACE(logger, 'Responding to `/configuration`', { config });
    res.json(config);
  });
  app.post('/configuration', async (req, res) => {
    const data = req.body;
    TRACE(logger, 'Handling POST `/configuration`', { data });
    game.configure(data.config, data.immediate)
      .then(() => res.json({ status: 'success' }))
      .catch(err => {
        logger.error('Configuration failed');
        logger.error(err);
        res.json({ status: 'failed', message: 'Configuration failed'});
      });
  });
  app.listen(options.port, () => {
    logger.info(`Server is running`, { port: options.port });
  });
}


yargs(process.argv.slice(2))
  .scriptName("anime-poster-quiz")
  .usage('$0 <cmd> [args]')
  .command('serve', 'Serve', (yargs) => {
    yargs.option('p', {
        alias: 'port',
        default: process.env.PORT ?? 3000,
        describe: 'Data from AniList',
        type: 'string'
    })
    .option('d', {
        alias: 'media-data',
        default: 'media.json',
        describe: 'Data from AniList',
        type: 'string'
    })
    .option('ri', {
        alias: 'reveal-interval',
        default: 5000,
        describe: 'Poster reveal interval in milliseconds',
        type: 'number'
    })
    .option('rt', {
        alias: 'results-time',
        default: 10000,
        describe: 'Result screen time in milliseconds',
        type: 'number'
    })
    .option('reset', {
        alias: 'reset-time',
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
    .option('min-cs', {
        alias: 'min-circle-size',
        default: 0.01,
        describe: 'Minimum reveal circle radius. As a fraction of max(<image width>, <image height>)',
        type: 'number'
    })
    .option('max-cs', {
        alias: 'max-circle-size',
        default: 0.1,
        describe: 'Minimum reveal circle radius. As a fraction of max(<image width>, <image height>)',
        type: 'number'
    })
    .option('nc', {
        alias: 'num-circles',
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
  },
  function (argv) {
    serve(
      {
        adminConfig: {
          mediaDataPath: argv.mediaData
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
        filters: argv.filters
      }
    )
  })
  .help()
  .parse()

