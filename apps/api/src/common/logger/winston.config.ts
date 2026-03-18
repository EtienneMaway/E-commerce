import { utilities as nestWinstonModuleUtilities } from 'nest-winston';
import * as winston from 'winston';

const { combine, timestamp, errors, json, colorize, simple } = winston.format;

const isDev = process.env.NODE_ENV !== 'production';

/** Human-readable format for local development */
const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  nestWinstonModuleUtilities.format.nestLike('API', {
    prettyPrint: true,
    colors: true,
  }),
);

/** Structured JSON for production log aggregation */
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json(),
);

export const winstonConfig: winston.LoggerOptions = {
  level: isDev ? 'debug' : 'info',
  transports: [
    new winston.transports.Console({
      format: isDev ? devFormat : prodFormat,
    }),
  ],
};
