import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    },
  }),
});

// Child loggers per module
export const apiLogger = logger.child({ module: 'api' });
export const botLogger = logger.child({ module: 'bot' });
export const dbLogger = logger.child({ module: 'db' });
export const serviceLogger = logger.child({ module: 'service' });
