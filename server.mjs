import express from 'express';
import path from 'path';
import bodyParser from 'body-parser';
import { loadImage, createCanvas } from 'canvas';
import { promises as fs } from 'fs';
import { FilterCollection } from './filters.mjs';
import { compare, sleep, normalizeString } from './utils.mjs';
import { exampleMediaData } from './example-data.mjs';
import yargs from 'yargs';
import bunyan from 'bunyan'
const __dirname = import.meta.dirname;

var log = null;


const app = express();


class GameError extends Error {
  constructor(message) {
    super(message)
    this.name = 'GameError'
    Error.captureStackTrace(this, GameError);
  }
}


function dummyImage(){
    return createCanvas(10, 10).toBuffer();
}



class HintImage {
  #circles = [];
  #image;
  #jpegBuffer;

  constructor(image) {
    this.#image = image;
    this.#jpegBuffer = dummyImage();
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
    this.#jpegBuffer = canvas.toBuffer('image/jpeg');
  }

  async revealAll() {
    const canvas = this.blackCanvas(
      this.width,
      this.height
    )
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = ctx.createPattern(this.#image, "repeat");;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.#jpegBuffer = canvas.toBuffer('image/jpeg');
  }

  blackCanvas(w, h) {
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, w, h);
    return canvas;
  }

  get jpeg() {
    return this.#jpegBuffer;
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
    this.#id = id;
    log.trace('Creating MediaCollection', { this: this, mediaData });
    this.#data = mediaData;
    this.createMedias(this.#data);
  }

  createMedias() {
    log.info({ this: this, mediaDataLength: this.#data.length }, 'Creating medias');
    var fc
    const filteredData = (fc = this.#filterCollection) ?
      fc.filter(this.#data)
      : this.#data;
    log.info({ this: this, filteredDataLength: this.#data.length }, 'Filtered medias');
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
    log.trace({ completions });
    return completions
  }

  completions() {
    log.trace({this: this});
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
    log.debug({ this: this, adminConfig, gameConfig });
    const id = Date.now().toString(36);
    this.#id = id;
    this.#adminConfig = adminConfig;
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

  async doRevealAll() {
    log.info({ this: this });
    await this.hintImage.revealAll();
    const listeners = this.#nextHintListeners;
    this.#nextHintListeners = [];
    this.#phase = 'reveal';
    log.info({ this: this, numListeners: listeners.length });
    listeners.forEach(f => f(this.hintJpeg));
    this.#wait = this.#config.revealWait;
    return;
  }

  async doRevealMore() {
    log.info({ this: this });
    await this.hintImage.revealCircle(
      this.#config.circleSizeMin,
      this.#config.circleSizeMax
    )
    const listeners = this.#nextHintListeners;
    this.#nextHintListeners = [];
    log.info({ this: this, numListeners: listeners.length });
    listeners.forEach(f => f(this.hintJpeg));
    this.#wait = this.#config.revealWait;
    return;
  }

  doResults() {
    log.info({ this: this });
    const results
      = this.#results
      = this.#answers;
    const listeners = this.#resultListeners;
    this.#resultListeners = [];
    this.#phase = 'results';
    log.info({ this: this, numListeners: listeners.length });
    listeners.forEach(f => f(results));
    this.#wait = this.#config.resultWait;
    return;
  }

  async doReset() {
    this.info({ this: this });
    if(this.#newConfig) {
      await this.init();
      return;
    }
    const listeners = this.#resetListeners;
    this.#resetListeners = [];
    this.#phase = 'guessing';
    log.info({ this: this, listeners: listeners.length });
    listeners.forEach(f => f());
    await this.newQuestion();
    this.#wait = this.#config.shortWait;
    return;
  }

  async doMessage(messages, errors) {
    log.info({ this: this, messages, errors });
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

  async nextHintJpeg() {
    const listeners = this.#nextHintListeners;
    return new Promise((resolve) => listeners.push(resolve));
  }

  get hintJpeg() {
    return this.hintImage.jpeg;
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
    log.info({ this:this, player, answer });
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


async function serve(options) {
  log = bunyan.createLogger(
    {
      name: 'anilist-poster-quiz',
      level: options.trace
        ? 'trace'
        : options.debug
        ? 'debug'
        : 'info',
      src: true
    }
  );
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
  app.get('/next.jpg', async (_, res) => {
    const data = await game.nextHintJpeg();
    log.trace({ type: typeof(data), length: data.length });
    res.send(data);
  });
  app.get('/current.jpg', async (_, res) => {
    const data = await game.hintJpeg();
    log.trace({ type: typeof(data), length: data.length });
    res.send(data);
  });
  app.get('/', (_, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html')
    log.trace({ indexPath });
    res.sendFile(indexPath);
  });
  app.get('/next', (_, res) => {
    const data = game.next();
    log.trace({ data });
    res.json(data);
  });
  app.get('/completions', (_, res) => {
    const data = game.completions();
    log.trace({ data });
    res.json(data);
  });
  app.post('/submit', (req, res) => {
    const { nickname, answer } = req.body;
    game.submitAnswer(nickname, answer);
    const data = { status: 'success' }
    log.trace({ data, nickname, answer, });
    res.json(data);
  });
  app.get('/reset', async (_, res) => {
    const data = await game.reset();
    log.trace({ data });
    res.json(data);
  });
  app.get('/results', async (_, res) => {
    const data = await game.nextResults();
    log.trace({ data });
    res.json(data);
  });
  app.get('/message', async (_, res) => {
    const data = {
      status: 'success',
      data: {
        messages: game.messages,
      }
    };
    log.trace({ data });
    res.json(data);
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
        logger.error('Configuration failed');
        logger.error(err);
        res.json({ status: 'failed', message: 'Configuration failed'});
      });
  });
  app.listen(options.port, () => {
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

