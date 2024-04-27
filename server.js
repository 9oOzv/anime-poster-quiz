
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const { loadImage, createCanvas } = require('canvas');
const fs = require('fs').promises;
const { createContextLogger } = require('./logging.js');
const { FilterCollection } = require('./filters.js');
const { compare, sleep } = require('./utils.js');
const { exampleMediaData } = require('./example-data.js');

const logger = createContextLogger('server');

const app = express();
const PORT = process.env.PORT || 3000;


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

  #image = null;
  #data = {};

  constructor(data) {
    this.#data = data;
  }

  get answers() {
    return [
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
      this.#data.answers.map(a => [ normalizeString(a), a ])
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
  #data = [];
  #filterCollection = null;
  #completions = null;
  #medias = [];

  constructor(mediaData) {
    this.#data = mediaData;
    this.createMedias(this.#data);
  }

  createMedias() {
    var fc
    const filteredData = (fc = this.#filterCollection) ?
      fc.filter(this.#data)
      : this.#data;
    this.#medias = filteredData.map(m => new Media(m));
    this.completions = null;
  }

  setFilters(filterCollection) {
    this.#filterCollection = filterCollection;
    this.createMedias();
  }

  completions() {
    return this.#completions ??= [
      ...new Map(
        new Array().concat(
          ...this.#medias.map(
            m => [ ...m.normalizedCompletions ]
          )
        )
      )
    ];
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
    mediaDataPath: 'media.json',
    messageWait: 10000,
    revealWait: 5000,
    resultWait: 10000,
    resetWait: 1000,
    shortWait: 200,
    hintImagePath: 'image.jpg',
    numCircles: 20,
    circleSizeMin: 0.02,
    circleSizeMax: 0.1,
    filters: []
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

  constructor(options) {
    const id = Date.now().toString(36);
    this.#logger = createContextLogger('Game', { gameId: id });
    this.#id = id;
    this.setOptions(options);
  }

  setOptions(options) {
    this.#logger.info('Setting game options', { options });
    for(const [k, v] of Object.entries(options)) {
      this.#config[k] = v;
    }
    this.#logger.debug('New config', { config: this.#config });
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
    return await fs.readFile(this.#config.mediaDataPath, 'utf8')
      .then(JSON.parse)
      .catch(
        error => {
          this.#logger.error('Could not load data', { path: this.#config.mediaDataPath, error: error });
          this.#logger.error('Loading example media', { exampleMediaData });
          return exampleMediaData;
        }
      );
  }

  async doRevealAll() {
    this.#logger.info('Revealing all')
    await this.hintImage.revealAll();
    const listeners = this.#nextHintListeners;
    this.#nextHintListeners = [];
    this.#phase = 'reveal';
    this.#logger.verbose('Sending image', { listeners: listeners.length });
    listeners.forEach(
      f => f(this.hintJpegStream)
    );
    this.#wait = this.#config.revealWait;
    return;
  }

  async doRevealMore() {
    this.#logger.info('Revealing more')
    await this.hintImage.revealCircle(
      this.#config.circleSizeMin,
      this.#config.circleSizeMax
    )
    const listeners = this.#nextHintListeners;
    this.#nextHintListeners = [];
    this.#logger.verbose('Sending image', { listeners: listeners.length });
    listeners.forEach(f => f(this.hintJpegStream));
    this.#wait = this.#config.revealWait;
    return;
  }

  doResults() {
    this.#logger.info('Showing results');
    const results
      = this.#results
      = this.#answers;
    const listeners = this.#resultListeners;
    this.#resultListeners = [];
    this.#phase = 'results';
    this.#logger.verbose('Sending results', { listeners: listeners.length });
    listeners.forEach(f => f(results));
    this.#wait = this.#config.resultWait;
    return;
  }

  async doReset() {
    this.#logger.info('Resetting');
    if(this.#newConfig) {
      await this.init();
      return;
    }
    const listeners = this.#resetListeners;
    this.#resetListeners = [];
    this.#phase = 'guessing';
    this.#logger.verbose('Sending resets', { listeners: listeners.length });
    listeners.forEach(f => f());
    await this.newQuestion();
    this.#wait = this.#config.shortWait;
    return;
  }

  async doMessage(messages, errors) {
    this.#logger.info('Sending a message', { messages, errors });
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

  async run() {
    while(true) {
      this.#logger.trace(
        'Run start',
        { phase: this.#phase }
      );
      try {
        await this.doStuff();
      } catch(error) {
        if(error instanceof GameError) {
          this.#logger.error(error);
          await this.doMessage(null, error.message);
        } else {
          this.#logger.error(error);
          await this.doMessage(null, 'Something unexpected happened. Restarting.');
        }
      }
      this.#logger.trace(
        'Run end',
        {
          phase: this.#phase,
          wait: this.#wait
        }
      );
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
    this.#logger.info(
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
    this.#logger.info(`Received answer`, { player, answer });
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
    return this.#mediaCollection.completions;
  }

  get configuration() {
    return this.#config;
  }

  async configure(config, immediate = false) {
    this.#logger.info(
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
      args = JSON.parse(`[${argStr}]`);
      result.push({ name: functionName, args: args });
  }
  return result;
}


async function serve(options) {
  const gameConfig = options.gameConfig;
  gameConfig.filters = parseFilterString(options.filters);
  const game = new Game(gameConfig);
  await game.init();
  game.run();
  app.use(bodyParser.json());
  app.use('/static', express.static(path.join(__dirname, 'public')));
  app.get('/next.jpg', async (_, res) => {
    const stream = await game.nextHintJpegStream();
    logger.trace(
      'Responding to `next.jpg`',
      { typeofStream: typeof(stream) }
    )
    stream.pipe(res);
  });
  app.get('/current.jpg', async (_, res) => {
    const stream = (await game.hintJpegStream).pipe(res);
    logger.trace(
      'Responding to `current.jpg`',
      { typeofStream: typeof(stream) }
    )
  });
  app.get('/', (_, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html')
    logger.trace(
      'Responding to `/`',
      { indexPath }
    )
    res.sendFile(indexPath);
  });
  app.get('/next', (_, res) => {
    const data = game.next();
    logger.trace(
      'Responding to `/next`',
      { data }
    )
    res.json(data);
  });
  app.get('/completions', (_, res) => {
    const data = game.completions();
    logger.trace(
      'Responding to `/completions`',
      { data }
    )
    res.json(data);
  });
  app.post('/submit', (req, res) => {
    const { nickname, answer } = req.body;
    game.submitAnswer(nickname, answer);
    const data = { status: 'success' }
    logger.trace(
      'Responding to `/submit`',
      { data, nickname, answer, }
    )
    res.json(data);
  });
  app.get('/reset', async (_, res) => {
    const data = await game.reset();
    logger.trace(
      'Responding to `/reset`',
      { data }
    )
    res.json(data);
  });
  app.get('/results', async (_, res) => {
    const data = await game.nextResults();
    logger.trace(
      'Responding to `/results`',
      { data }
    )
    res.json(data);
  });
  app.get('/message', async (_, res) => {
    const data = {
      status: 'success',
      data: {
        messages: game.messages,
      }
    };
    logger.trace(
      'Responding to `/message`',
      { data }
    )
    res.json(data);
  });
  app.get('/configure', (_, res) => {
    const htmlPath = path.join(__dirname, 'public', 'config.html')
    logger.trace(
      'Responding to `/configure`',
      { htmlPath }
    )
    res.sendFile(htmlPath);
  });
  app.get('/configuration', (_, res) => {
    const config = game.configuration;
    logger.trace(
      'Responding to `/configuration`',
      { config }
    )
    res.json(config);
  });
  app.post('/configuration', async (req, res) => {
    const data = req.body;
    logger.trace(
      'Handling POST `/configuration`',
      { data }
    )
    game.configure(data.config, data.immediate)
      .then(() => res.json({ status: 'success' }))
      .catch(err => {
        logger.error('Configuration failed');
        logger.error(err);
        res.json({ status: 'failed', message: 'Configuration failed'});
      });
  });
  app.listen(PORT, () => {
    logger.info(`Server is running`, { PORT });
  });
}


require('yargs')
  .scriptName("anime-poster-quiz")
  .usage('$0 <cmd> [args]')
  .command('serve', 'Serve', (yargs) => {
    yargs.option('md', {
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
    .option('hint-image-path', {
        default: path.join(__dirname, 'public', 'image.jpg'),
        describe: 'Place for the generated hint image',
        type: 'string'
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
        gameConfig: {
          mediaDataPath: argv.mediaData,
          revealWait: argv.revealInterval,
          resultWait: argv.resultsTime,
          resetWait: argv.resetTime,
          shortWait: argv.shortWait,
          hintImagePath: argv.hintImagePath,
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
