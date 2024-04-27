const { MESSAGE } = require('triple-beam');
const winston = require('winston');
const { format } = require('logform');
const colors = require('@colors/colors/safe');
const { prettyShort, wrap, indent, nonNulls } = require('./utils.js');


const primaryColors = {
  fatal: colors.red,
  error: colors.brightRed,
  warning: colors.brightYellow,
  info: colors.brightBlue,
  notice: colors.blue,
  verbose: colors.brightWhite,
  debug: colors.white,
  trace: colors.dim,
}

const secondaryColors = {
  fatal: colors.red,
  error: colors.brightRed,
  warning: colors.brightYellow,
  info: colors.brightWhite,
  notice: colors.white,
  verbose: colors.white,
  debug: colors.white,
  trace: colors.dim,
}



const customFormat = {
  transform: (info) => {
    const maxLines = 128;
    const maxLength = 2048;
    const prefix = '❱❱ ';
    const maxLineWidth = 120 - prefix.length;
    var {timestamp, level, context, functionContext, message, name, stack, ...extra} = info;
    const c1 = primaryColors[level] ?? colors.white;
    const c2 = secondaryColors[level] ?? colors.white;
    const extraText =
      prettyShort(
        extra,
        maxLines,
        maxLineWidth,
        maxLength
      );

    const messageIsError = (message instanceof Error);
    stack = messageIsError ? message.stack : stack;
    message = messageIsError ? `${message.name}: ${message.message}` : message;
    const stackText = stack && wrap(stack, maxLineWidth);

    const firstLine = `${level}: ${message}`;
    functionContext = functionContext.replace(`${context}.`, '');
    const secondLine = nonNulls([timestamp, context, functionContext]).join(' ');
    const rest = nonNulls([extraText, stackText]).join('\n');
    const lines = [
      c1(firstLine),
      c1(secondLine),
      c2(indent(rest, c1(prefix), true))
    ];
    info[MESSAGE] = lines.join('\n');
    return info;
  }
}


const winstonLogger = winston.createLogger({
  levels: {
    fatal: 0,
    error: 1,
    warning: 2,
    info: 3,
    notice: 4,
    verbose: 5,
    debug: 6,
    trace: 7
  },
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


function createContextLogger(context, extra) {
  const logger = winstonLogger.child(
    Object.assign(
      {},
      { context: context },
      extra
    )
  );
  function log(level, message, data = {}) {
    const re = /at ([^(]+) /g;
    e = new Error();
    const ctx = (re.exec(e.stack), re.exec(e.stack), re.exec(e.stack));
    logger.log(
      level,
      message,
      {
        functionContext: ctx ? ctx[1] : '',
        ...data
      }
    );
  }
  function warning(message, data) { log('warning', message, data); }
  function error(message, data) { log('error', message, data); }
  function info(message, data) { log('info', message, data); }
  function notice(message, data) { log('notice', message, data); }
  function verbose(message, data) { log('verbose', message, data); }
  function debug(message, data) { log('debug', message, data); }
  function trace(message, data) { log('trace', message, data); }
  return { debug, info, notice, error, warning, verbose, trace };
}

module.exports = {
  createContextLogger
};

