const { MESSAGE } = require('triple-beam');
const winston = require('winston');
const { format } = require('logform');
const colors = require('@colors/colors/safe');
const { prettyShort, wrap, indent } = require('./utils.js');


const levelColors = {
  info: colors.brightBlue.bold,
  verbose: colors.brightWhite.bold,
  debug: colors.brightCyan.bold,
  warning: colors.brightYellow.bold,
  error: colors.brightRed.bold
}


const customFormat = {
  transform: (info) => {
    const maxLines = 64;
    const maxLength = 2048;
    const prefix = '❱❱ ';
    const maxLineWidth = 120 - prefix.length;
    var {timestamp, level, context, message, name, stack, ...rest} = info;
    const lc = levelColors[level] ?? colors.white;
    var restText =
      prettyShort(
        rest,
        maxLines,
        maxLineWidth,
        maxLength
      );
    if(message instanceof Error) {
      stack = message.stack;
      message = `${message.name}: ${message.message}`;
    } else if (name && stack) {
      message = `${name}: ${message}`
    }
    const lines = [
      lc(`${level}: ${message}`),
      lc(`${timestamp} ${context}`),
      ...restText.split('\n'),
      ...(stack ? wrap(stack, maxLineWidth).split('\n') : [])
    ];
    var text;
    if(stack){
      text = lc(indent(lines.join('\n'), prefix, false));
    } else {
      text = indent(lines.join('\n'), lc(prefix), false);
    }
    info[MESSAGE] = text;
    return info;
  }
}


const winstonLogger = winston.createLogger({
  levels: winston.config.syslog.levels,
  format: format.combine(
    format.timestamp(),
    customFormat,
  ),
  transports: [
    new winston.transports.Console(
      {
        level: 'debug'
      }
    ),
  ]
});


function createLogger(extra) {
  const logger = winstonLogger.child(extra);
  function log(level, message, data = {}) {
    const re = /at ([^(]+) /g;
    e = new Error();
    const ctx = (re.exec(e.stack), re.exec(e.stack), re.exec(e.stack));
    logger.log(
      level,
      message,
      {
        context: ctx ? ctx[1] : '',
        ...data
      }
    );
  }
  function info(message, data) { log('info', message, data); }
  function warning(message, data) { log('warning', message, data); }
  function error(message, data) { log('error', message, data); }
  function verbose(message, data) { log('info', message, data); }
  function debug(message, data) { log('debug', message, data); }
  return { debug, info, error, warning, verbose };
}

module.exports = {
  createLogger
};

