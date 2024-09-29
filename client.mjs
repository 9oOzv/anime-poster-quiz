import { log } from './log.mjs';

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
    log.debug({ this: this, json: json});
    const data = JSON.parse(json);
    try {
      const command = data.command;
      const args = data.args;
      this.game.clientCommand(this, command, ...args);
    } catch (error) {
      log.error(error);
    }
  }
}

export {
  Client
}

