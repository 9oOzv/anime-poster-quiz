
import { promises as fs } from 'fs';
import { FilterCollection } from './filters.mjs';
import { compare, sleep } from './utils.mjs';
import { exampleMediaData } from './example-data.mjs';
import { HintImage } from './hintimage.mjs'
import { MediaCollection } from './media.mjs';
import {
  log,
  debugged,
  traced,
  infoed
} from './log.mjs';

class GameError extends Error {
  constructor(message) {
    super(message)
    this.name = 'GameError'
    Error.captureStackTrace(this, GameError);
  }
}


class Game {

  #config;
  #newConfig
  #id;
  #answers;
  #results;
  hintImage;
  #currentMedia;
  #start;
  #phase;
  #wait;
  #mediaCollection;
  messages;
  #clients;

  constructor(config) {
    log.debug({ this: this, config });
    this.#config = config;
    const id = Date.now().toString(36);
    this.#id = id;
    this.#clients = new Set();
    this.setupLogging();
  }

  setupLogging() {
    const full = {};
    // const noThis = {
    //   logThis: false,
    // };
    // const nameOnly = {
    //   logThis: false,
    //   logArgs: false,
    //   logResult: false,
    // };
    this.initClient = infoed(this.initClient, 'Client initialized');
    this.removeClient = infoed(this.removeClient, 'Client removed');
    this.addClient = infoed(this.addClient, 'Client added');
    this.doReset = infoed(this.doReset, 'Resetting');
    this.updateGameConfig = infoed(this.updateGameConfig, 'Updating config');
    this.init = traced(debugged(this.init, full));
    this.initClient = traced(debugged(this.initClient, full));
    this.removeClient = traced(debugged(this.removeClient, full));
    this.addClient = traced(debugged(this.addClient, full));
    this.clientCommand = traced(debugged(this.clientCommand, full));
    this.loadData = traced(debugged(this.loadData, full));
    this.sendCommands = traced(debugged(this.sendCommands, full));
    this.doRevealAll = traced(debugged(this.doRevealAll, full));
    this.doRevealMore = traced(debugged(this.doRevealMore, full));
    this.doResults = traced(debugged(this.doResults, full));
    this.doReset = traced(debugged(this.doReset, full));
    this.doMessage = traced(debugged(this.doMessage, full));
    this.doStuff = traced(debugged(this.doStuff, full));
    this.doError = traced(debugged(this.doError, full));
    this.run = traced(debugged(this.run, full));
    this.newQuestion = traced(debugged(this.newQuestion, full));
    this.submitAnswer = traced(debugged(this.submitAnswer, full));
    this.configuration = traced(debugged(this.configuration, full));
    this.updateGameConfig = traced(debugged(this.updateGameConfig, full));
  }


  async init() {
    this.#mediaCollection = new MediaCollection(this.loadData());
    const filterCollection = new FilterCollection(this.#config.parsedFilters);
    this.#mediaCollection.setFilters(filterCollection);
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
    const mediaDataPath = this.#config.mediaDataPath;
    if (!mediaDataPath) {
      log.info({ this: this, exampleMediaData });
      return exampleMediaData;
    }
    return await fs.readFile(this.#config.mediaDataPath, 'utf8')
      .then(JSON.parse)
      .catch(
        error => {
          log.error({ this: this, path: this.#config.mediaDataPath, error: error });
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
    const results = this.#answers;
    this.sendCommands('showResults', results);
    this.#phase = 'results';
    this.#wait = this.#config.resultWait;
    return;
  }

  async doReset() {
    log.info({ this: this });
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
      await this.doStuff()
        .catch(error => this.doError(error));
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
    return this.#mediaCollection.completions();
  }

  configuration() {
    return this.#config.getGroup('game');
  }

  updateGameConfig(data) {
    this.#config.update(data, 'game');
    this.init();
  }

}

export {
  Game,
  GameError
}
