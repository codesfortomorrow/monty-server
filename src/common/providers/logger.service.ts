import 'dotenv/config';
import 'winston-mongodb';
import { Logger, createLogger, transports, format } from 'winston';
import { Environment } from '../types';

const { Console, MongoDB } = transports;

const LogLevel = { error: 0, warn: 1, info: 2, debug: 3 } as const;
type LogLevel = keyof typeof LogLevel;

export class LoggerService {
  private readonly logger: Logger;
  private readonly isProduction: boolean;
  private readonly dbUri: string;

  private static mongoTransport: any;
  private static consoleTransport: typeof transports.Console;

  constructor(defaultMeta?: Record<string, any>) {
    this.isProduction = process.env.NODE_ENV === Environment.Production;
    this.dbUri = process.env.MONGO_URI || 'mongodb://localhost:27017';

    /** Create console transport only once */
    if (!LoggerService.consoleTransport) {
      LoggerService.consoleTransport = new Console({
        level: process.env.LOG_LEVEL || 'info',
        format: format.combine(
          format.colorize(),
          format.printf(({ level, message, timestamp }) => {
            return `${timestamp} ${level}: ${message}`;
          }),
        ),
      });
    }

    /** Create Mongo transport only once */
    if (!LoggerService.mongoTransport && this.isProduction) {
      LoggerService.mongoTransport = new MongoDB({
        level: process.env.LOG_LEVEL || 'info',
        db: this.dbUri,
        collection: 'logs',
        metaKey: 'metadata',
        tryReconnect: true,
        options: {
          maxPoolSize: 5,
          minPoolSize: 1,
        },
      });
    }

    this.logger = createLogger({
      levels: LogLevel,
      level: process.env.LOG_LEVEL || 'info',
      defaultMeta,
      format: this.getFormat(),
      transports: this.getTransports(),
    });
  }

  private getTransports() {
    const list: any[] = [LoggerService.consoleTransport];

    if (this.isProduction && LoggerService.mongoTransport) {
      list.push(LoggerService.mongoTransport);
    }

    return list;
  }

  private getFormat() {
    return format.combine(
      format.timestamp(),
      format.errors({ stack: true }),
      format.splat(),
      format.json(),
    );
  }

  setDefaultMeta(meta?: Record<string, any>) {
    this.logger.defaultMeta = meta;
  }

  /** Child logger without creating new transports */
  child(meta?: Record<string, any>): Logger {
    return this.logger.child(meta || {});
  }

  log(level: LogLevel, message: any, ...args: any[]) {
    this.logger.log(level, message, ...args);
  }

  info(message: any, ...args: any[]) {
    this.logger.info(message, ...args);
  }

  error(message: any, ...args: any[]) {
    this.logger.error(message, ...args);
  }

  warn(message: any, ...args: any[]) {
    this.logger.warn(message, ...args);
  }

  debug(message: any, ...args: any[]) {
    this.logger.debug(message, ...args);
  }
}
