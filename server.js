
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const { loadImage, createCanvas } = require('canvas');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 3000;

// Example data from AniList API. Only mandatory attributes for the list items are: 'coverImage.extraLarge' and one or more of (title.natime, title.english, title.romaji, synonyms, hashtag). Other attributes may be used for filtering etc. in the future
const exampleMediaData = [{"type":"ANIME","id":121,"idMal":121,"seasonYear":2003,"season":"FALL","seasonInt":34,"popularity":197705,"favourites":5028,"trending":3,"hashtag":null,"synonyms":["Full Metal Alchemist","FMA","\u05d0\u05dc\u05db\u05d9\u05de\u05d0\u05d9 \u05d4\u05de\u05ea\u05db\u05ea","Stalowy alchemik","\uac15\ucca0\uc758 \uc5f0\uae08\uc220\uc0ac","\u0e41\u0e02\u0e19\u0e01\u0e25 \u0e04\u0e19\u0e41\u0e1b\u0e23\u0e18\u0e32\u0e15\u0e38","\u92fc\u4e4b\u934a\u91d1\u8853\u5e2b","\u94a2\u4e4b\u70bc\u91d1\u672f\u5e08","\u0416\u0435\u043b\u0435\u0437\u043d\u0438\u044f\u0442 \u0410\u043b\u0445\u0438\u043c\u0438\u043a","\u0421\u0442\u0430\u043b\u0435\u0432\u0438\u0439 \u0430\u043b\u0445\u0456\u043c\u0456\u043a"],"tags":[{"id":1291,"name":"Alchemy"},{"id":29,"name":"Magic"},{"id":391,"name":"Philosophy"},{"id":85,"name":"Tragedy"},{"id":82,"name":"Male Protagonist"},{"id":34,"name":"Military"},{"id":102,"name":"Coming of Age"},{"id":56,"name":"Shounen"},{"id":111,"name":"War"},{"id":1310,"name":"Travel"},{"id":146,"name":"Alternate Universe"},{"id":1219,"name":"Disability"},{"id":639,"name":"Body Horror"},{"id":456,"name":"Conspiracy"},{"id":95,"name":"Steampunk"},{"id":774,"name":"Chimera"},{"id":198,"name":"Foreign"},{"id":324,"name":"Chibi"},{"id":801,"name":"Cyborg"},{"id":104,"name":"Anti-Hero"},{"id":1091,"name":"Religion"}],"coverImage":{"extraLarge":"https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx121-JUlbsyhTUNkk.png"},"genres":["Action","Adventure","Drama","Fantasy"],"averageScore":78,"meanScore":79,"title":{"native":"\u92fc\u306e\u932c\u91d1\u8853\u5e2b","romaji":"Hagane no Renkinjutsushi","english":"Fullmetal Alchemist"}},{"type":"ANIME","id":49,"idMal":49,"seasonYear":1993,"season":"WINTER","seasonInt":931,"popularity":8686,"favourites":94,"trending":0,"hashtag":null,"synonyms":["Ah! My Goddess (OVA)","Oh, mia dea!"],"tags":[{"id":253,"name":"Gods"},{"id":1045,"name":"Heterosexual"},{"id":321,"name":"Urban Fantasy"},{"id":86,"name":"Primarily Female Cast"},{"id":29,"name":"Magic"},{"id":404,"name":"College"},{"id":50,"name":"Seinen"},{"id":82,"name":"Male Protagonist"},{"id":779,"name":"Kuudere"},{"id":173,"name":"Motorcycles"}],"coverImage":{"extraLarge":"https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx49-jv1G7rSP4lxg.png"},"genres":["Comedy","Drama","Romance","Supernatural"],"averageScore":68,"meanScore":69,"title":{"native":"\u3042\u3042\u3063\u5973\u795e\u3055\u307e\u3063","romaji":"Aa! Megami-sama!","english":"Oh! My Goddess"}},{"type":"ANIME","id":19815,"idMal":19815,"seasonYear":2014,"season":"SPRING","seasonInt":142,"popularity":421767,"favourites":14413,"trending":5,"hashtag":"#nogenora","synonyms":["NGNL","NO GAME NO LIFE\u6e38\u620f\u4eba\u751f","\u6e38\u620f\u4eba\u751f","\u0e42\u0e19\u0e40\u0e01\u0e21 \u0e42\u0e19\u0e44\u0e25\u0e1f\u0e4c"],"tags":[{"id":244,"name":"Isekai"},{"id":91,"name":"Gambling"},{"id":146,"name":"Alternate Universe"},{"id":308,"name":"Video Games"},{"id":282,"name":"Hikikomori"},{"id":29,"name":"Magic"},{"id":82,"name":"Male Protagonist"},{"id":86,"name":"Primarily Female Cast"},{"id":98,"name":"Female Protagonist"},{"id":103,"name":"Politics"},{"id":39,"name":"Parody"},{"id":253,"name":"Gods"},{"id":1310,"name":"Travel"},{"id":779,"name":"Kuudere"},{"id":365,"name":"Memory Manipulation"},{"id":254,"name":"Kemonomimi"},{"id":1403,"name":"Class Struggle"},{"id":1419,"name":"Kingdom Management"},{"id":144,"name":"Meta"},{"id":23,"name":"Female Harem"},{"id":113,"name":"Nekomimi"},{"id":598,"name":"Elf"},{"id":100,"name":"Nudity"},{"id":66,"name":"Super Power"},{"id":1105,"name":"Judo"}],"coverImage":{"extraLarge":"https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/nx19815-bIo51RMWWhLv.jpg"},"genres":["Adventure","Comedy","Ecchi","Fantasy"],"averageScore":77,"meanScore":77,"title":{"native":"\u30ce\u30fc\u30b2\u30fc\u30e0\u30fb\u30ce\u30fc\u30e9\u30a4\u30d5","romaji":"No Game No Life","english":"No Game, No Life"}}];


function normalizeString(str) {
  return str
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}


function isTypeable(str) {
  if(typeof str !== 'string') { return false; }
  return true
}


function compare(a, b) {
    const c = a.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const d = b.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    return c === d;
}


function isValidMedia(media) {
  if(!media) {
    console.warning('Media does not have data');
    return false;
  }
  if(!media.coverImage.extraLarge) {
    console.warning('Media is missing image URL');
    return false;
  }
  if(!(media.title.english || media.title.romaji)) {
    console.warning('Media is missing titles');
    return false;
  }
  return true;
}


mediaFilters = new Map(Object.entries({
  popularity: (m, min, max) => min <= m.popularity <= max,
  validMedia: isValidMedia
}));


class HintImage {
  #circles = [];
  #jpegStream;
  #media;

  constructor(media) {
    this.#media = media;
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
      await this.image,
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
    const canvas = blackCanvas(
      await image.width,
      await image.height
    )
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = ctx.createPattern(this.image, "repeat");;
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

  get image() {
    return this.#media.image;
  }

  get jpegStream() {
    return this.#jpegStream;
  }

  get width() {
    return this.image.then(image => image.width);
  }

  get height() {
    return this.image.then(image => image.height);
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
      ...(this.synonyms ?? []),
      ...this.hashtags
    ];
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
  
  get image() {
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


class FilterCollection {
  #filters = [];
  #filterSpecs = [];

  constructor(filterSpecs) {
    this.#filterSpecs = [
      {
        name: 'validMedia',
        args: []
      },
      ...filterSpecs
    ];
    this.createFilters();
  }

  createFilter(filterSpec) {
    const f = mediaFilters.get(filterSpec.name);
    this.#filters.push(
      m => f(m, ...filterSpec.args)
    );
  }

  createFilters() {
    this.#filters = [];
    for(const f of this.#filterSpecs) {
      this.createFilter(f);
    }
  }

  filter(medias) {
    return medias.filter(
      m => this.#filters.every(
        f => f(m)
      )
    )
  }

}


class Game {
  #config = {
    mediaDataPath: 'media.json',
    revealWait: 5000,
    resultWait: 10000,
    resetWait: 1000,
    shortWait: 200,
    hintImagePath: 'image.jpg',
    maxCircles: 20,
    circleSizeMin: 0.02,
    circleSizeMax: 0.1,
    filters: []
  };
  #mediaData = [];
  #answers = {};
  #results = {};
  hintImage = null;
  #currentMedia = null;
  #start = null;
  #circles = [];
  #phase = '';
  #wait = 0;
  #mediaCollection = null;
  #nextHintListeners = [];
  #resultListeners = [];
  #resetListeners = [];

  constructor(options) {
    for(const [k, v] of Object.entries(options)) {
      this.#config[k] = v;
    }
  }

  async init() {
    this.#mediaData = await this.loadData();
    this.#mediaCollection = new MediaCollection(this.#mediaData);
    const filterCollection = new FilterCollection(this.#config.filters);
    this.#mediaCollection.setFilters(filterCollection);
  }

  async loadData() {
    return await fs.readFile(this.#config.mediaDataPath, 'utf8')
      .then(JSON.parse)
      .catch(
        error => {
          console.error(
            `Could not load data from ${this.#config.mediaDataPath}.`
            + ' Loading example data',
            error
          );
          return exampleMediaData;
        }
      );
  }

  async doRevealAll() {
    console.log('Revealing all');
    await this.hintImage.revealAll();
    const listeners = this.#nextHintListeners;
    this.#nextHintListeners = [];
    console.log(`Sending image to ${listeners.length} players`);
    listeners.forEach(
      f => f(this.hintJpegStream)
    );
    this.#phase = 'reveal';
    this.#wait = this.#config.revealWait;
    return;
  }

  async doRevealMore() {
    console.log('Revealing more');
    await this.hintImage.revealCircle(
      this.#config.circleSizeMin,
      this.#config.circleSizeMax
    )
    const listeners = this.#nextHintListeners;
    this.#nextHintListeners = [];
    console.log(`Sending image to ${listeners.length} players`);
    listeners.forEach(f => f(this.hintJpegStream));
    this.#wait = this.#config.revealWait;
    return;
  }

  doResults() {
    console.log('Showing results');
    const results
      = this.#results
      = this.#answers;
    const listeners = this.#resultListeners;
    this.#resultListeners = [];
    console.log(`Sending results to ${listeners.length} players`);
    listeners.forEach(f => f(results));
    this.#phase = 'results';
    this.#wait = this.#config.resultWait;
    return;
  }

  doReset() {
    console.log('Resetting');
    const listeners = this.#resetListeners;
    this.#resetListeners = [];
    console.log(`Sending resets to ${listeners.length} players`);
    listeners.forEach(f => f({ status: 'success' }));
    this.newQuestion();
    this.#phase = 'guessing';
    this.#wait = this.#config.shortWait;
    return;
  }

  async doStuff() {
    if (this.#phase == 'guessing') {
      if (this.#circles.length >= this.#config.maxCircles) {
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
    await this.doStuff();
    setTimeout(this.run.bind(this), this.#wait);
  }

  newQuestion() {
    this.#start = Date.now();
    const media
      = this.#currentMedia
      = this.#mediaCollection.random();
    this.hintImage = new HintImage(media);
    this.#answers = {};
    this.#answers['CORRECT ANSWER'] = {
      answer: media.displayAnswer,
      correct: true,
      time: 0
    }
  }

  get nextHintJpegStream() {
    const listeners = this.#nextHintListeners;
    return new Promise((resolve) => listeners.push(resolve));
  }

  get hintJpegStream() {
    return this.hintImage.jpegStream;
  }

  get reset() {
    const listeners = this.#resetListeners;
    return new Promise((resolve) => listeners.push(resolve));
  }

  get nextResults() {
    const listeners = this.#resultListeners;
    return new Promise((resolve) => listeners.push(resolve));
  }

  get results() {
    return this.#results;
  }

  submitAnswer(player, answer) {
    console.log(`Received answer from ${player}: ${answer}`);
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
    if(this.#phase === 'results')
    {
      return { action: 'reset' };
    }
    return { action: 'image' };
  }

  completions() {
    return this.#mediaCollection.completions;
  }

}


function success(res) {
  res.json({ status: 'success' });
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
    (await game.nextHintJpegStream).pipe(res);
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
    success(res);
  });
  app.get('/reset', async (_, res) => {
    res.json(await game.reset);
  });
  app.get('/results', async (_, res) => {
    res.json(await game.nextResults);
  });
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
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
          shortWait: argv.short_wait,
          hintImagePath: argv.hintImagePath,
          maxCircles: argv.numCircles,
          circleSizeMin: argv.minCircleSize,
          circleSizeMax: argv.maxCircleSize
        },
        filterString: argv.filters
      }
    )
  })
  .help()
  .parse()
