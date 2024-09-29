import bunyan from 'bunyan';

const log = bunyan.createLogger({
  name: 'log',
  level: 'info',
  src: true,
  serializers: bunyan.stdSerializers
});

export { log };
