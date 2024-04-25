
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const { loadImage, createCanvas } = require('canvas');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 3000;

// Example data from AniList API. Only mandatory attributes for the list items are: 'coverImage.extraLarge' and one or more of (title.natime, title.english, title.romaji, synonyms, hashtag). Other attributes may be used for filtering etc. in the future
const exampleMediaData = [{"type":"ANIME","id":121,"idMal":121,"seasonYear":2003,"season":"FALL","seasonInt":34,"popularity":197705,"favourites":5028,"trending":3,"hashtag":null,"synonyms":["Full Metal Alchemist","FMA","\u05d0\u05dc\u05db\u05d9\u05de\u05d0\u05d9 \u05d4\u05de\u05ea\u05db\u05ea","Stalowy alchemik","\uac15\ucca0\uc758 \uc5f0\uae08\uc220\uc0ac","\u0e41\u0e02\u0e19\u0e01\u0e25 \u0e04\u0e19\u0e41\u0e1b\u0e23\u0e18\u0e32\u0e15\u0e38","\u92fc\u4e4b\u934a\u91d1\u8853\u5e2b","\u94a2\u4e4b\u70bc\u91d1\u672f\u5e08","\u0416\u0435\u043b\u0435\u0437\u043d\u0438\u044f\u0442 \u0410\u043b\u0445\u0438\u043c\u0438\u043a","\u0421\u0442\u0430\u043b\u0435\u0432\u0438\u0439 \u0430\u043b\u0445\u0456\u043c\u0456\u043a"],"tags":[{"id":1291,"name":"Alchemy"},{"id":29,"name":"Magic"},{"id":391,"name":"Philosophy"},{"id":85,"name":"Tragedy"},{"id":82,"name":"Male Protagonist"},{"id":34,"name":"Military"},{"id":102,"name":"Coming of Age"},{"id":56,"name":"Shounen"},{"id":111,"name":"War"},{"id":1310,"name":"Travel"},{"id":146,"name":"Alternate Universe"},{"id":1219,"name":"Disability"},{"id":639,"name":"Body Horror"},{"id":456,"name":"Conspiracy"},{"id":95,"name":"Steampunk"},{"id":774,"name":"Chimera"},{"id":198,"name":"Foreign"},{"id":324,"name":"Chibi"},{"id":801,"name":"Cyborg"},{"id":104,"name":"Anti-Hero"},{"id":1091,"name":"Religion"}],"coverImage":{"extraLarge":"https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx121-JUlbsyhTUNkk.png"},"genres":["Action","Adventure","Drama","Fantasy"],"averageScore":78,"meanScore":79,"title":{"native":"\u92fc\u306e\u932c\u91d1\u8853\u5e2b","romaji":"Hagane no Renkinjutsushi","english":"Fullmetal Alchemist"}},{"type":"ANIME","id":49,"idMal":49,"seasonYear":1993,"season":"WINTER","seasonInt":931,"popularity":8686,"favourites":94,"trending":0,"hashtag":null,"synonyms":["Ah! My Goddess (OVA)","Oh, mia dea!"],"tags":[{"id":253,"name":"Gods"},{"id":1045,"name":"Heterosexual"},{"id":321,"name":"Urban Fantasy"},{"id":86,"name":"Primarily Female Cast"},{"id":29,"name":"Magic"},{"id":404,"name":"College"},{"id":50,"name":"Seinen"},{"id":82,"name":"Male Protagonist"},{"id":779,"name":"Kuudere"},{"id":173,"name":"Motorcycles"}],"coverImage":{"extraLarge":"https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx49-jv1G7rSP4lxg.png"},"genres":["Comedy","Drama","Romance","Supernatural"],"averageScore":68,"meanScore":69,"title":{"native":"\u3042\u3042\u3063\u5973\u795e\u3055\u307e\u3063","romaji":"Aa! Megami-sama!","english":"Oh! My Goddess"}},{"type":"ANIME","id":19815,"idMal":19815,"seasonYear":2014,"season":"SPRING","seasonInt":142,"popularity":421767,"favourites":14413,"trending":5,"hashtag":"#nogenora","synonyms":["NGNL","NO GAME NO LIFE\u6e38\u620f\u4eba\u751f","\u6e38\u620f\u4eba\u751f","\u0e42\u0e19\u0e40\u0e01\u0e21 \u0e42\u0e19\u0e44\u0e25\u0e1f\u0e4c"],"tags":[{"id":244,"name":"Isekai"},{"id":91,"name":"Gambling"},{"id":146,"name":"Alternate Universe"},{"id":308,"name":"Video Games"},{"id":282,"name":"Hikikomori"},{"id":29,"name":"Magic"},{"id":82,"name":"Male Protagonist"},{"id":86,"name":"Primarily Female Cast"},{"id":98,"name":"Female Protagonist"},{"id":103,"name":"Politics"},{"id":39,"name":"Parody"},{"id":253,"name":"Gods"},{"id":1310,"name":"Travel"},{"id":779,"name":"Kuudere"},{"id":365,"name":"Memory Manipulation"},{"id":254,"name":"Kemonomimi"},{"id":1403,"name":"Class Struggle"},{"id":1419,"name":"Kingdom Management"},{"id":144,"name":"Meta"},{"id":23,"name":"Female Harem"},{"id":113,"name":"Nekomimi"},{"id":598,"name":"Elf"},{"id":100,"name":"Nudity"},{"id":66,"name":"Super Power"},{"id":1105,"name":"Judo"}],"coverImage":{"extraLarge":"https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/nx19815-bIo51RMWWhLv.jpg"},"genres":["Adventure","Comedy","Ecchi","Fantasy"],"averageScore":77,"meanScore":77,"title":{"native":"\u30ce\u30fc\u30b2\u30fc\u30e0\u30fb\u30ce\u30fc\u30e9\u30a4\u30d5","romaji":"No Game No Life","english":"No Game, No Life"}}];


function isTypeable(str) {
  if(typeof str !== 'string') { return false; }
  return true
}


function compare(a, b) {
    const c = a.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const d = b.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    return c === d;
}


function createRandomCircle(width, height, minRadius = 0, maxRadius = 1) {
  const radiusFrac = minRadius + Math.random() * (maxRadius - minRadius);
  const radius = radiusFrac * Math.max(width, height);
  const x = Math.random() * (width - 2 * radius) + radius;
  const y = Math.random() * (height - 2 * radius) + radius;
  return { x, y, radius };
}


async function coverImage(image, circles, outputPath) {
  const canvas = blackCanvas(image.width, image.height)
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = ctx.createPattern(image, "repeat");;
  fillCircles(ctx, circles);
  await saveCanvas(canvas, outputPath);
}


async function revealImage(image, outputPath) {
  const canvas = blackCanvas(image.width, image.height)
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = ctx.createPattern(image, "repeat");;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await saveCanvas(canvas, outputPath);
}


async function saveCanvas(canvas, path) {
  const outputStream = require('fs').createWriteStream(path);
  const stream = canvas.createJPEGStream();
  stream.pipe(outputStream);
  return new Promise((resolve, reject) => {
    outputStream.on('finish', () => {
      resolve();
    });
    outputStream.on('error', (err) => {
      reject(err);
    });
  });
}


function blackCanvas(w, h) {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, w, h);
  return canvas;
}


function fillCircles(ctx, circles) {
  circles.forEach(circle => {
    ctx.beginPath();
    ctx.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2);
    ctx.fill();
  });
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
      circleSizeMax: 0.1
  };
  #answers = {};
  #results = {};
  #posterIndex = null;
  #poster = null;
  #posterImage = null;
  #start = null;
  #circles = [];
  #mediaData = exampleMediaData;
  #posters = [];
  #nextPhase = 'reset';
  #resetRequests = [];
  #imageRequests = [];
  #resultRequests = [];
  #wait = 0;
  #choices = [];

  constructor(options) {
    for(const [k, v] of Object.entries(options)) {
      this.#config[k] = v;
    }
  }

  allAnswers() {
    return this.#posters.reduce(
      (acc, p) => acc.push(...p.answers) && acc,
      []
    )
  }

  async init() {
    await this.loadData();
    let choices = this.allAnswers();
    choices = [...new Set(choices)];
    this.#choices = choices;
  }

  mediaToPoster(media) {
    const imageUrl = media.coverImage.extraLarge;
    const answers = [
      media.title.english,
      media.title.romaji,
      media.title.native,
      ...(media.synonyms ?? []),
      ...(media.hashtag ?? '').split(' ')
    ];
    const filteredAnswers = answers.filter(isTypeable);
    return {
      imageUrl: imageUrl,
      answers: filteredAnswers
    }
  }

  isValidPoster(poster) {
      if(!poster) {
        console.warning('Poster does not have data');
        return false;
      }
      if(!poster.imageUrl) {
        console.warning('Poster is missing image URL');
        return false;
      }
      if(!poster.answers || poster.answers.length <= 0) {
        console.warning('Poster is missing answers');
        return false;
      }
    return true;
  }

  postersFromMediaData(){
    let posters = this.#mediaData.map(this.mediaToPoster.bind(this));
    posters = posters.filter(this.isValidPoster.bind(this));
    return posters;
  }

  async loadData() {
    if(!this.#config.mediaDataPath) {
      console.info('No mediaDataPath given. Using example data');
      return;
    }
    try {
      this.#mediaData = JSON.parse(
        await fs.readFile(
          this.#config.mediaDataPath,
          'utf8'
        )
      );
      this.#posters = this.postersFromMediaData();
    } catch(error) {
      console.error(`Could not load data from ${this.#config.mediaDataPath}`);
    }
  }

  async doStuff() {
    if (this.#nextPhase == 'reset') {
      console.log('Resetting');
      this.sendResets();
      this.#nextPhase = 'changePoster';
      this.#wait = this.#config.resetWait;
      return;
    }
    if (this.#nextPhase == 'results') {
      console.log('Showing results');
      this.sendResults();
      this.#nextPhase = 'reset';
      this.#wait = this.#config.resultWait;
      return;
    }
    if (this.#nextPhase == 'changePoster') {
      console.log('Changing poster');
      await this.newQuestion();
      this.#nextPhase = 'guess';
      this.#wait = this.#config.shortWait;
      return;
    }
    if (this.#nextPhase == 'guess' && this.#circles.length >= this.#config.maxCircles) {
      console.log('Revealing all');
      await this.revealAll();
      this.sendImages();
      this.#nextPhase = 'results';
      this.#wait = this.#config.revealWait;
      return;
    }
    if (this.#nextPhase == 'guess' && this.#circles.length < this.#config.maxCircles) {
      console.log('Revealing more');
      await this.revealMore();
      this.sendImages();
      this.#wait = this.#config.revealWait;
      return;
    }
    console.log('Weird');
    this.#wait = this.#config.defaultWait;
    return;
  }

  async run() {
    await this.doStuff();
    setTimeout(this.run.bind(this), this.#wait);
  }

  randomPosterIndex() {
    return Math.floor(Math.random() * this.#posters.length);
  }

  async newQuestion() {
    this.#start = Date.now();
    this.#posterIndex = this.randomPosterIndex();
    this.#poster = this.#posters[this.#posterIndex];
    this.#circles = [];
    this.#answers = {};
    this.#posterImage = await loadImage(this.#poster.imageUrl);
  }

  async revealMore() {
    const image = this.#posterImage;
    this.#circles.push(
      createRandomCircle(
        image.width,
        image.height,
        this.#config.circleSizeMin,
        this.#config.circleSizeMax
      )
    );
    await coverImage(
      image,
      this.#circles,
      this.#config.hintImagePath
    );
  }

  async revealAll() {
    await revealImage(
      this.#posterImage,
      this.#config.hintImagePath
    );
  }

  sendResets() {
    let requests = this.#resetRequests;
    this.#resetRequests = [];
    console.log(`Sending reset to ${requests.length} players`);
    requests.forEach(res => success(res));
  }

  sendImages() {
    let requests = this.#imageRequests;
    this.#imageRequests = [];
    console.log(`Sending hint image to ${requests.length} players`)
    requests.forEach(res => res.sendFile(this.#config.hintImagePath));
  }

  sendResults() {
    this.#results = this.#answers;
    let requests = this.#resultRequests;
    this.#resultRequests = [];
    console.log(`Sending results to ${requests.length} players`)
    requests.forEach(res => res.json(this.#results));
  }

  queueImageRequest(res) {
    this.#imageRequests.push(res);
  }

  queueResetRequest(res) {
    if(this.#nextPhase == 'reset') {
      this.#resetRequests.push(res);
    } else {
      success(res);
    }
  }

  queueResultRequest(res) {
    if(this.#nextPhase == 'results') {
      this.#resultRequests.push(res);
    } else {
      res.json(this.#results);
    }
  }

  submitAnswer(player, answer) {
    console.log(`Received answer from ${player}: ${answer}`);
    const accepted = this.#posters[this.#posterIndex].answers;
    this.#answers[player] = {
      answer: answer,
      correct: accepted.some(a => compare(a, answer)),
      time: Date.now() - this.#start
    };
  }

  next() {
    let action = 'reload';
    if(this.#nextPhase == 'results') {
      action = 'results';
    }
    if(this.#nextPhase == 'reset') {
      action = 'reset';
    }
    if(this.#nextPhase == 'changePoster') {
      action = 'image';
    }
    if(this.#nextPhase == 'guess') {
      action = 'image';
    }
    return { action };
  }

  choices() {
    return this.#choices;
  }

}


function success(res) {
  res.json({ status: 'success' });
}


function serve(gameOptions) {
  const game = new Game(gameOptions);
  game.init();
  game.run();
  app.use(bodyParser.json());
  app.use('/static', express.static(path.join(__dirname, 'public')));
  app.get('/image.jpg', (_, res) => {
    game.queueImageRequest(res);
  });
  app.get('/', (_, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
  app.get('/next', (_, res) => {
    res.json(game.next());
  });
  app.get('/choices', (_, res) => {
    res.json(game.choices());
  });
  app.post('/submit', (req, res) => {
    const { nickname, answer } = req.body;
    game.submitAnswer(nickname, answer);
    success(res);
  });
  app.get('/reset', (_, res) => {
    game.queueResetRequest(res);
  });
  app.get('/results', (_, res) => {
    game.queueResultRequest(res);
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
  },
  function (argv) {
    serve({
      mediaDataPath: argv.mediaData,
      revealWait: argv.revealInterval,
      resultWait: argv.resultsTime,
      resetWait: argv.resetTime,
      shortWait: argv.short_wait,
      hintImagePath: argv.hintImagePath,
      maxCircles: argv.numCircles,
      circleSizeMin: argv.minCircleSize,
      circleSizeMax: argv.maxCircleSize
    })
  })
  .help()
  .parse()
