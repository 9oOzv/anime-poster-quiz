import Config from './config.mjs';
import path from 'path';

const dirname = import.meta.dirname;


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


class ServerConfig extends Config {

  setup() {
    this.option(
      'port',
      8080,
      'Port number',
      'number',
      'admin'
    );
    this.option(
      'mediaData',
      path.join(dirname, 'media.json'),
      'Data from AniList',
      'string',
      'admin'
    );
    this.option(
      'dummyMediaData',
      false,
      'Use dummy media data instead of loading from file',
      'boolean',
      'admin'
    );
    this.option(
      'revealInterval',
      1000,
      'Poster reveal interval in milliseconds',
      'number',
      'game'
    );
    this.option(
      'resultsTime',
      10000,
      'Time to show results in milliseconds',
      'number',
      'game'
    );
    this.option(
      'resetTime',
      1000,
      'Time to reset game in milliseconds',
      'number',
      'game'
    );
    this.option(
      'shortWait',
      200,
      'Shortest wait between phases. Should preferably be larger than network latency',
      'number',
      'game'
    );
    this.option(
      'defaultWait',
      1000,
      'Default wait time when switching between game phases',
      'number',
      'game'
    );
    this.option(
      'minCircleSize',
      0.002,
      'Minimum circle size',
      'number',
      'game'
    );
    this.option(
      'maxCircleSize',
      0.12,
      'Maximum circle size',
      'number',
      'game'
    );
    this.option(
      'numCircles',
      20,
      'Number of circles to reveal',
      'number',
      'game'
    );
    this.option(
      'filters',
      '',
      'Add filters. Format: "filter1Name(a,b,c);filter2Name(d,e,f);..."',
      'string',
      'game'
    );
    this.option(
      'debug',
      false,
      'Debug logging',
      'boolean',
      'admin'
    );
    this.option(
      'trace',
      false,
      'Trace logging',
      'boolean',
      'admin'
    );
  }

  postUpdate() {
    this.parsedFilters = parseFilterString(this.filters);
  }
};

export default ServerConfig;
