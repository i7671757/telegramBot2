import dotenv from 'dotenv';
import path from 'path';

// Загружаем переменные окружения
dotenv.config();

export interface SecurityConfig {
  // Bot Configuration
  botToken: string;
  botUsername?: string;
  
  // Webhook Security
  webhookSecret?: string;
  webhookUrl?: string;
  webhookPath: string;
  
  // Server Configuration
  port: number;
  host: string;
  nodeEnv: string;
  
  // Session Security
  sessionSecret: string;
  sessionPath: string;
  
  // Rate Limiting
  rateLimiting: {
    windowMs: number;
    maxRequests: number;
    skipSuccessful: boolean;
    enabled: boolean;
  };
  
  // Authentication
  jwt: {
    secret: string;
    expiresIn: string;
  };
  
  // Admin Configuration
  admin: {
    chatId?: number;
    username?: string;
  };
  
  // API Configuration
  api: {
    url: string;
    key?: string;
    timeout: number;
  };
  
  // Feature Flags
  features: {
    analytics: boolean;
    caching: boolean;
    rateLimiting: boolean;
    webhookValidation: boolean;
    debugLogging: boolean;
    testMode: boolean;
  };
  
  // Logging
  logging: {
    level: string;
    filePath: string;
    maxFiles: number;
    maxSize: string;
  };
}

/**
 * Валидация обязательных переменных окружения
 */
function validateRequiredEnvVars(): void {
  const required = [
    'BOT_TOKEN',
    'SESSION_SECRET',
    'JWT_SECRET'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/**
 * Валидация формата токена бота
 */
function validateBotToken(token: string): boolean {
  // Telegram bot token format: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz
  const tokenRegex = /^\d{8,10}:[A-Za-z0-9_-]{35}$/;
  return tokenRegex.test(token);
}

/**
 * Генерация случайного секрета если не задан
 */
function generateSecret(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Безопасное получение числового значения
 */
function getNumberEnv(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    console.warn(`Invalid number for ${key}: ${value}, using default: ${defaultValue}`);
    return defaultValue;
  }
  
  return parsed;
}

/**
 * Безопасное получение булевого значения
 */
function getBooleanEnv(key: string, defaultValue: boolean): boolean {
  const value = process.env[key]?.toLowerCase();
  if (!value) return defaultValue;
  
  return value === 'true' || value === '1' || value === 'yes';
}

/**
 * Создание безопасной конфигурации
 */
function createSecurityConfig(): SecurityConfig {
  // Валидация обязательных переменных
  validateRequiredEnvVars();
  
  const botToken = process.env.BOT_TOKEN!;
  
  // Валидация токена бота
  if (!validateBotToken(botToken)) {
    throw new Error('Invalid BOT_TOKEN format');
  }
  
  // Генерация секретов если не заданы
  const sessionSecret = process.env.SESSION_SECRET || generateSecret();
  const jwtSecret = process.env.JWT_SECRET || generateSecret();
  const webhookSecret = process.env.WEBHOOK_SECRET || generateSecret(16);
  
  if (!process.env.SESSION_SECRET) {
    console.warn('SESSION_SECRET not set, generated random secret');
  }
  
  if (!process.env.JWT_SECRET) {
    console.warn('JWT_SECRET not set, generated random secret');
  }
  
  return {
    // Bot Configuration
    botToken,
    botUsername: process.env.BOT_USERNAME,
    
    // Webhook Security
    webhookSecret,
    webhookUrl: process.env.WEBHOOK_URL,
    webhookPath: process.env.WEBHOOK_PATH || '/webhook',
    
    // Server Configuration
    port: getNumberEnv('PORT', 3000),
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
    
    // Session Security
    sessionSecret,
    sessionPath: process.env.SESSION_PATH || './sessions.json',
    
    // Rate Limiting
    rateLimiting: {
      windowMs: getNumberEnv('RATE_LIMIT_WINDOW_MS', 60000), // 1 minute
      maxRequests: getNumberEnv('RATE_LIMIT_MAX_REQUESTS', 30),
      skipSuccessful: getBooleanEnv('RATE_LIMIT_SKIP_SUCCESSFUL', true),
      enabled: getBooleanEnv('ENABLE_RATE_LIMITING', true)
    },
    
    // Authentication
    jwt: {
      secret: jwtSecret,
      expiresIn: process.env.JWT_EXPIRES_IN || '24h'
    },
    
    // Admin Configuration
    admin: {
      chatId: process.env.ADMIN_CHAT_ID ? parseInt(process.env.ADMIN_CHAT_ID) : undefined,
      username: process.env.ADMIN_USERNAME
    },
    
    // API Configuration
    api: {
      url: process.env.API_URL || 'https://api.lesailes.uz/',
      key: process.env.API_KEY,
      timeout: getNumberEnv('API_TIMEOUT', 10000)
    },
    
    // Feature Flags
    features: {
      analytics: getBooleanEnv('ENABLE_ANALYTICS', true),
      caching: getBooleanEnv('ENABLE_CACHING', true),
      rateLimiting: getBooleanEnv('ENABLE_RATE_LIMITING', true),
      webhookValidation: getBooleanEnv('ENABLE_WEBHOOK_VALIDATION', true),
      debugLogging: getBooleanEnv('ENABLE_DEBUG_LOGGING', false),
      testMode: getBooleanEnv('ENABLE_TEST_MODE', false)
    },
    
    // Logging
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      filePath: process.env.LOG_FILE_PATH || './logs/',
      maxFiles: getNumberEnv('LOG_MAX_FILES', 30),
      maxSize: process.env.LOG_MAX_SIZE || '10m'
    }
  };
}

/**
 * Маскирование чувствительных данных для логирования
 */
export function maskSensitiveData(config: SecurityConfig): Partial<SecurityConfig> {
  return {
    ...config,
    botToken: config.botToken.substring(0, 10) + '...',
    webhookSecret: config.webhookSecret ? '***' : undefined,
    sessionSecret: '***',
    jwt: {
      ...config.jwt,
      secret: '***'
    },
    api: {
      ...config.api,
      key: config.api.key ? '***' : undefined
    }
  };
}

/**
 * Проверка безопасности конфигурации
 */
export function validateSecurityConfig(config: SecurityConfig): { isSecure: boolean; warnings: string[] } {
  const warnings: string[] = [];
  
  // Проверка production настроек
  if (config.nodeEnv === 'production') {
    if (!config.webhookUrl) {
      warnings.push('WEBHOOK_URL should be set in production');
    }
    
    if (!config.webhookSecret) {
      warnings.push('WEBHOOK_SECRET should be set in production');
    }
    
    if (config.features.debugLogging) {
      warnings.push('Debug logging should be disabled in production');
    }
    
    if (config.features.testMode) {
      warnings.push('Test mode should be disabled in production');
    }
  }
  
  // Проверка силы секретов
  if (config.sessionSecret.length < 16) {
    warnings.push('SESSION_SECRET should be at least 16 characters long');
  }
  
  if (config.jwt.secret.length < 16) {
    warnings.push('JWT_SECRET should be at least 16 characters long');
  }
  
  // Проверка rate limiting
  if (config.rateLimiting.maxRequests > 100) {
    warnings.push('Rate limit seems too high, consider lowering MAX_REQUESTS');
  }
  
  return {
    isSecure: warnings.length === 0,
    warnings
  };
}

// Создаем и экспортируем конфигурацию
export const securityConfig = createSecurityConfig();

// Валидируем конфигурацию при загрузке
const validation = validateSecurityConfig(securityConfig);
if (validation.warnings.length > 0) {
  console.warn('Security configuration warnings:');
  validation.warnings.forEach(warning => console.warn(`  - ${warning}`));
}

// Логируем замаскированную конфигурацию
if (securityConfig.features.debugLogging) {
  console.log('Security configuration loaded:', maskSensitiveData(securityConfig));
} 