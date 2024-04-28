import tripleBeam from 'triple-beam';
import winston from 'winston';
import { format } from 'logform';
import colors from '@colors/colors/safe.js';
import {truncate, wrap, indent} from './utils.mjs';

const LOGGING_LEVEL = process.env.TRACE ? 'trace' : process.env.DEBUG ? 'debug' : 'notice';

const primaryColors = {
  fatal: colors.red,
  error: colors.brightRed,
  warning: colors.brightYellow,
  info: colors.brightBlue,
  notice: colors.blue,
  verbose: colors.brightWhite,
  debug: colors.dim,
  trace: colors.gray,
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


const stackFormat = {
  transform: ({message, stack, ...rest}) => ({
    message: message,
    stack: [
      ...(message?.stack ?? []),
      ...(stack ?? [])
    ].join('\n'),
    ...rest
  })
}


const objectMessageFormat = {
  transform: ({message, ...rest}) =>
    ({
      message:
        (messageIsError = message instanceof Error) ? `${message.name}: ${message.message}` :
        (messageIsObject = typeof message === 'object') ? `Log message` :
        message,
      ...rest
    })
}


const restFormat = {
  transform: ({level, message, stack, ...rest}) => {
    const limitWidth = 117;
    const limitLines = 128;
    const limitCharacters = 2048;
    var text = wrap(JSON.stringify(rest, null, 2), limitWidth);
    const nLines = text.split(/\r\n|\r|\n/).length;
    var extra
    if(nLines > limitLines) {
      text = truncate(
        wrap(
          JSON.stringify(text)
          , limitWidth
        ),
        limitCharacters
      )
    }
    return {
      level,
      message: message,
      stack,
      extra: text,
      ...rest
    };
  }
}


const customFormat = {
  transform: ({timestamp, level, context, functionContext, message, stack, extra, ...rest}) => {
    const prefix = '❱❱ ';
    const primaryColor = primaryColors[level] ?? colors.white;
    const secondaryColor = secondaryColors[level] ?? colors.white;
    functionContext = functionContext?.replace(`${context}.`, '') ?? '';
    const lines = [
      primaryColor(`${level}: ${message}`),
      primaryColor(`${timestamp ?? ''} ${context ?? ''} ${functionContext ?? ''}`.trim()),
      secondaryColor(indent(extra ?? '', primaryColor(prefix), true)),
      secondaryColor(indent(stack ?? '', primaryColor(prefix), true))
    ];
    return {
      timestamp, level, context, functionContext, stack, extra, message,
      [tripleBeam.MESSAGE]: lines.join('\n'),
      ...rest
    }
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
    stackFormat,
    restFormat,
    customFormat,
    //format.prettyPrint()
  ),
  transports: [
    new winston.transports.Console(
      {
        level: LOGGING_LEVEL ?? 'notice'
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
  function _log(level, message, data = {}, stack) {
    const re = /at ([^(]+) /g;
    stack ??= (new Error()).stack;
    const ctx = (re.exec(stack), re.exec(stack), re.exec(stack));
    logger.log(
      level,
      message,
      {
        functionContext: ctx ? ctx[1] : '',
        ...data
      }
    );
  }
  function log(level, message, data, stack) { _log(level, message, data, stack); }
  function warning(message, data) { _log('warning', message, data); }
  function error(message, data) { _log('error', message, data); }
  function info(message, data) { _log('info', message, data); }
  function notice(message, data) { _log('notice', message, data); }
  function verbose(message, data) { _log('verbose', message, data); }
  function debug(message, data) { _log('debug', message, data); }
  function trace(message, data) { _log('trace', message, data); }
  return { _log, debug, info, notice, error, warning, verbose, trace };
}

const _logger = createContextLogger();

async function LOG(level, logger, message, data, stack) {
  stack ??= (new Error()).stack;
  (logger?._log || logger?.logger?._log || _logger._log)(level, message, data, stack);
}

const ERROR = (...args) => LOG('warning', ...args);
const WARNING = (...args) => LOG('warning', ...args);
const INFO = (...args) => LOG('info', ...args);
const NOTICE = (...args) => LOG('notice', ...args);
const VERBOSE = (...args) => LOG('verbose', ...args);
const DEBUG = (...args) => LOG('debug', ...args);
const TRACE = (...args) => LOG('trace', ...args);


export {
  createContextLogger,
  LOG,
  ERROR,
  WARNING,
  INFO,
  NOTICE,
  VERBOSE,
  DEBUG,
  TRACE,
};

