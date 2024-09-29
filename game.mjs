
import { promises as fs } from 'fs';
import { FilterCollection } from './filters.mjs';
import { compare, sleep } from './utils.mjs';
import { exampleMediaData } from './example-data.mjs';
import { HintImage } from './hintimage.mjs'
import { MediaCollection } from './media.mjs';
import { log } from './log.mjs';

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

  constructor(
    adminConfig,
    gameConfig
  ) {
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

export {
  Game,
  GameError
}
