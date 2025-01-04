import express from 'express';
import path from 'path';
import bodyParser from 'body-parser';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import http from 'http';
import { WebSocketServer } from 'ws';
const __dirname = import.meta.dirname;
import { Game } from './game.mjs';
import { log } from './log.mjs';
import { Client } from './client.mjs';
import ServerConfig from './serverconfig.mjs';


const app = express();
const server = http.createServer(app)


async function serve(config) {
  log.level(
    config.trace ? 'trace'
    : config.debug ? 'debug'
    : 'info'
  );
  log.debug({ config });
  const game = new Game(config);
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
    const config = game.gameConfig;
    log.trace({ config });
    res.json(config);
  });
  app.post('/configuration', async (req, res) => {
    const data = req.body;
    log.trace({ data });
    await game.updateGameConfig(data)
      .then(() => res.json({ status: 'success' }))
      .catch(err => {
        logger.error('Configuration failed');
        logger.error(err);
        res.json({ status: 'failed', message: 'Configuration failed'});
      });
  });
  const wss = new WebSocketServer({server: server, path: "/ws"});
  wss.on(
    "connection",
    (ws) => game.addClient(new Client(ws))
  );
  server.listen(config.port, () => {
    log.info({ port: config.port });
  });
}


const defaultConfig = new ServerConfig({env: {}});
const dc = defaultConfig;
let y = yargs(hideBin(process.argv))
for (const name of dc.names) {
  y = y.option(
    name,
    {
      describe: `${dc.descriptions[name]} [${dc.envNames[name]}] (${dc.defaultValues[name]})`,
      type: dc.types[name]
    }
  );
}
y = y.command(
  'start',
  'Start the server',
  () => {
    const config = new ServerConfig({options: y.argv});
    serve(config);
  }
);
y.help()
  .wrap(y.terminalWidth())
  .env()
  .parse();
