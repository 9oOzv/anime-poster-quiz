import bunyan from 'bunyan';

const logs = new Map();

function getLog(name) {
  if (!logs.has(name)) {
    logs.set(
      name,
      bunyan.createLogger({
        name: name,
        level: 'info',
        src: true,
        serializers: bunyan.stdSerializers
      })
    );
  }
  return logs.get(name);
}

function configLog(name, level=undefined, fields={}) {
  const log = getLog(name);
  if (!(level ?? true)) {
    log.level(level);
  }
  delete fields.stream;
  delete fields.streams;
  delete fields.serializers;
  delete fields.src;
  Object.keys(fields).forEach(function (k) {
      log.fields[k] = fields[k];
  });
  return log;
}

export {
  getLog,
  configLog
}
