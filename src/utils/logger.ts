import fs from 'fs';
import path from 'path';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  userId?: number;
  scene?: string;
  error?: any;
  metadata?: any;
}

class Logger {
  private logLevel: LogLevel;
  private logDir: string;

  constructor(logLevel: LogLevel = LogLevel.INFO) {
    this.logLevel = logLevel;
    this.logDir = path.join(process.cwd(), 'logs');
    this.ensureLogDirectory();
  }

  private ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private formatMessage(level: string, message: string, metadata?: any): string {
    const timestamp = new Date().toISOString();
    const logEntry: LogEntry = {
      timestamp,
      level,
      message,
      ...metadata
    };
    return JSON.stringify(logEntry);
  }

  private writeToFile(level: string, formattedMessage: string) {
    const date = new Date().toISOString().split('T')[0];
    const filename = `${date}.log`;
    const filepath = path.join(this.logDir, filename);
    
    fs.appendFileSync(filepath, formattedMessage + '\n');
  }

  private log(level: LogLevel, levelName: string, message: string, metadata?: any) {
    if (level <= this.logLevel) {
      const formattedMessage = this.formatMessage(levelName, message, metadata);
      
      // Консольный вывод с цветами
      const colors = {
        ERROR: '\x1b[31m', // красный
        WARN: '\x1b[33m',  // желтый
        INFO: '\x1b[36m',  // голубой
        DEBUG: '\x1b[90m'  // серый
      };
      
      console.log(`${colors[levelName as keyof typeof colors]}[${levelName}]\x1b[0m ${message}`, metadata || '');
      
      // Запись в файл
      this.writeToFile(levelName, formattedMessage);
    }
  }

  error(message: string, error?: any, metadata?: any) {
    this.log(LogLevel.ERROR, 'ERROR', message, { error: error?.message || error, stack: error?.stack, ...metadata });
  }

  warn(message: string, metadata?: any) {
    this.log(LogLevel.WARN, 'WARN', message, metadata);
  }

  info(message: string, metadata?: any) {
    this.log(LogLevel.INFO, 'INFO', message, metadata);
  }

  debug(message: string, metadata?: any) {
    this.log(LogLevel.DEBUG, 'DEBUG', message, metadata);
  }

  // Специальные методы для бота
  userAction(userId: number, action: string, scene?: string, metadata?: any) {
    this.info(`User action: ${action}`, { userId, scene, ...metadata });
  }

  apiCall(endpoint: string, method: string, status?: number, duration?: number) {
    this.info(`API call: ${method} ${endpoint}`, { status, duration });
  }

  sceneTransition(userId: number, fromScene: string, toScene: string) {
    this.info(`Scene transition: ${fromScene} -> ${toScene}`, { userId });
  }
}

// Экспортируем единственный экземпляр
export const logger = new Logger(
  process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO
); 