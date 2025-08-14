import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { loggingConfig } from '../config';

// Create logs directory
const logsDir = path.join(process.cwd(), 'logs');

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

// Console format with colors
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} ${level}: ${message}`;
    if (Object.keys(metadata).length > 0 && metadata.stack) {
      msg += `\n${metadata.stack}`;
    } else if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata, null, 2)}`;
    }
    return msg;
  })
);

// Create transports
const transports: winston.transport[] = [
  // Console transport
  new winston.transports.Console({
    format: consoleFormat,
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  }),
];

// Add file transports in production
if (process.env.NODE_ENV === 'production') {
  // General logs
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, 'gamebot-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: loggingConfig.maxSize,
      maxFiles: loggingConfig.maxFiles,
      format: logFormat,
      level: loggingConfig.level,
    })
  );

  // Error logs
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: loggingConfig.maxSize,
      maxFiles: loggingConfig.maxFiles,
      format: logFormat,
      level: 'error',
    })
  );
}

// Create logger
export const logger = winston.createLogger({
  level: loggingConfig.level,
  format: logFormat,
  transports,
  exitOnError: false,
});

// Log unhandled errors
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Helper functions for structured logging
export function logGameEvent(gameId: string, event: string, data?: any) {
  logger.info(`Game Event: ${event}`, {
    gameId,
    event,
    ...data,
  });
}

export function logPlayerAction(playerId: string, action: string, data?: any) {
  logger.info(`Player Action: ${action}`, {
    playerId,
    action,
    ...data,
  });
}

export function logPlatformEvent(platform: string, event: string, data?: any) {
  logger.info(`Platform Event: ${event}`, {
    platform,
    event,
    ...data,
  });
}

export function logError(error: Error, context?: string) {
  logger.error(context || 'Error occurred', {
    error: error.message,
    stack: error.stack,
  });
}

export function logPerformance(operation: string, duration: number, metadata?: any) {
  logger.debug(`Performance: ${operation}`, {
    operation,
    duration: `${duration}ms`,
    ...metadata,
  });
}

// Export logger instance
export default logger;