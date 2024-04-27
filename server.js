
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const { loadImage, createCanvas } = require('canvas');
const fs = require('fs').promises;
const { createLogger } = require('./logging.js');
const { FilterCollection } = require('./filters.js');
const { compare } = require('./utils.js');
const { exampleMediaData } = require('./example-data.js');

const logger = createLogger();
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
        (await this.width),
        (await this.height),
        minRadius,
        maxRadius
      )
    );
    this.revealCircles();
  }

  async revealCircles() {
    const canvas = this.blackCanvas(
      await this.width,
      await this.height
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

  constructor(options) {
    const id = Date.now().toString(36);
    this.#logger = createLogger({ class: 'Game', gameId: id });
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
    this.#nextHintListeners = [];
    this.#resultListeners = [];
    this.#resetListeners = [];
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
    this.#logger.verbose('Sending image', { listeners: listeners.length });
    listeners.forEach(
      f => f(this.hintJpegStream)
    );
    this.#phase = 'reveal';
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
    this.#logger.verbose('Sending results', { listeners: listeners.length });
    listeners.forEach(f => f(results));
    this.#phase = 'results';
    this.#wait = this.#config.resultWait;
    return;
  }

  async doReset() {
    this.#logger.info('Resetting');
    const listeners = this.#resetListeners;
    this.#resetListeners = [];
    this.#logger.verbose('Sending resets', { listeners: listeners.length });
    listeners.forEach(f => f());
    await this.newQuestion();
    this.#phase = 'guessing';
    this.#wait = this.#config.shortWait;
    return;
  }

  async doMessage(messages, errors) {
    this.#logger.info('Sending a message', { messages, errors });
    this.#resetListeners.forEach(f => f(data));
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
    setTimeout(this.run.bind(this), this.#wait);
  }

  async newQuestion() {
    this.#start = Date.now();
    const media
      = this.#currentMedia
      = this.#mediaCollection.random();
    if(!media) {
      throw new GameError('Could not load media. Maybe a configuration/filter problem?');
    }
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

}


function parseFilterString(filterString) {
  const regex = /(\w+)\(([^)]*)\);?/g;
  let match;
  const result = [];
  while ((match = regex.exec(filterString)) !== null) {
      const functionName = match[1];
      const args = match[2].split(',').map(arg => arg.trim());
      result.push({ name: functionName, args: args });
  }
  return result;
}


async function serve(options) {
  const gameConfig = options.gameConfig;
  gameConfig.filters = parseFilterString(options.filters);
  const game = new Game(gameConfig);
  await game.init();
  await game.run();
  app.use(bodyParser.json());
  app.use('/static', express.static(path.join(__dirname, 'public')));
  app.get('/next.jpg', async (_, res) => {
    (await game.nextHintJpegStream()).pipe(res);
  });
  app.get('/current.jpg', async (_, res) => {
    (await game.hintJpegStream).pipe(res);
  });
  app.get('/', (_, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
  app.get('/next', (_, res) => {
    res.json(game.next());
  });
  app.get('/completions', (_, res) => {
    res.json(game.completions());
  });
  app.post('/submit', (req, res) => {
    const { nickname, answer } = req.body;
    game.submitAnswer(nickname, answer);
    res.json({ status: 'success' });
  });
  app.get('/reset', async (_, res) => {
    res.json(await game.reset());
  });
  app.get('/results', async (_, res) => {
    res.json(await game.nextResults());
  });
  app.get('/message', async (_, res) => {
    res.json({
      status: success,
      data: {
        messages: game.messages,
      }
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
