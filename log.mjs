import bunyan from 'bunyan';

const log = bunyan.createLogger({
  name: 'log',
  level: 'info',
  src: true,
  serializers: bunyan.stdSerializers
});

function logged(
  func,
  {
    enter = true,
    exit = true,
    logThis = false,
    logArgs = true,
    logResult = true,
    level = 'debug',
  }
  = {}
) {
  return function(...args) {
    if(enter) {
      const entryData = {};
      if (logThis) entryData.this = this;
      if (logArgs) entryData.args = args;
      log[level](entryData, 'call');
    }
    const result = func.apply(this, args);
    if(exit) {
      const exitData = {};
      if (logThis) exitData.this = this;
      if (logResult) exitData.result = result;
      log[level](exitData, 'return');
    }
    return result;
  };
}


function debugged(func, options = {}) {
  return logged(
    func,
    {
      level: 'debug',
      ...options,
    }
  );
}

function traced(func, options = {}) {
  return logged(
    func,
    {
      level: 'trace',
      ...options,
    }
  );
}

function infoed(func, title, { logArgs = true } = {}) {
  return function(...args) {
    if (logArgs) {
      log.info(`${title}: ${args}`);
    } else {
      log.info(title);
    }
    return func(...args);
  }
}

export {
  log,
  debugged,
  traced,
  infoed
};

export default log;
