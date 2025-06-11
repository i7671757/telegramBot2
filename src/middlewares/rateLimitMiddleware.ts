import type { AuthContext } from './auth';
import { securityConfig } from '../config/security';

interface RateLimitEntry {
  count: number;
  resetTime: number;
  firstRequest: number;
}

interface UserRateLimit {
  requests: RateLimitEntry;
  commands: RateLimitEntry;
  messages: RateLimitEntry;
  callbacks: RateLimitEntry;
}

export class RateLimitService {
  private static instance: RateLimitService;
  private userLimits = new Map<number, UserRateLimit>();
  private globalStats = {
    totalRequests: 0,
    blockedRequests: 0,
    uniqueUsers: new Set<number>()
  };

  private constructor() {
    // Очистка устаревших записей каждые 5 минут
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  static getInstance(): RateLimitService {
    if (!RateLimitService.instance) {
      RateLimitService.instance = new RateLimitService();
    }
    return RateLimitService.instance;
  }

  /**
   * Проверка лимита для пользователя
   */
  checkLimit(userId: number, type: 'requests' | 'commands' | 'messages' | 'callbacks' = 'requests'): {
    allowed: boolean;
    remaining: number;
    resetTime: number;
    retryAfter?: number;
  } {
    const now = Date.now();
    const config = securityConfig.rateLimiting;
    
    if (!config.enabled) {
      return { allowed: true, remaining: config.maxRequests, resetTime: now + config.windowMs };
    }

    // Получаем или создаем лимиты для пользователя
    let userLimit = this.userLimits.get(userId);
    if (!userLimit) {
      userLimit = this.createUserLimit(now, config.windowMs);
      this.userLimits.set(userId, userLimit);
    }

    const limit = userLimit[type];
    
    // Проверяем, нужно ли сбросить счетчик
    if (now >= limit.resetTime) {
      limit.count = 0;
      limit.resetTime = now + config.windowMs;
      limit.firstRequest = now;
    }

    // Обновляем статистику
    this.globalStats.totalRequests++;
    this.globalStats.uniqueUsers.add(userId);

    // Проверяем лимит
    if (limit.count >= config.maxRequests) {
      this.globalStats.blockedRequests++;
      
      return {
        allowed: false,
        remaining: 0,
        resetTime: limit.resetTime,
        retryAfter: Math.ceil((limit.resetTime - now) / 1000)
      };
    }

    // Увеличиваем счетчик
    limit.count++;
    
    return {
      allowed: true,
      remaining: config.maxRequests - limit.count,
      resetTime: limit.resetTime
    };
  }

  /**
   * Проверка на подозрительную активность
   */
  checkSuspiciousActivity(userId: number): {
    isSuspicious: boolean;
    reason?: string;
    severity: 'low' | 'medium' | 'high';
  } {
    const userLimit = this.userLimits.get(userId);
    if (!userLimit) {
      return { isSuspicious: false, severity: 'low' };
    }

    const now = Date.now();
    const config = securityConfig.rateLimiting;

    // Проверка на слишком быстрые запросы
    const timeSinceFirst = now - userLimit.requests.firstRequest;
    if (userLimit.requests.count > 10 && timeSinceFirst < 5000) {
      return {
        isSuspicious: true,
        reason: 'Too many requests in short time',
        severity: 'high'
      };
    }

    // Проверка на превышение лимита команд
    if (userLimit.commands.count > config.maxRequests * 0.8) {
      return {
        isSuspicious: true,
        reason: 'Excessive command usage',
        severity: 'medium'
      };
    }

    // Проверка на спам сообщений
    if (userLimit.messages.count > config.maxRequests * 0.9) {
      return {
        isSuspicious: true,
        reason: 'Message spam detected',
        severity: 'medium'
      };
    }

    return { isSuspicious: false, severity: 'low' };
  }

  /**
   * Временная блокировка пользователя
   */
  blockUser(userId: number, duration: number = 300000): void { // 5 минут по умолчанию
    const userLimit = this.userLimits.get(userId);
    if (userLimit) {
      const blockUntil = Date.now() + duration;
      
      // Устанавливаем время сброса на время окончания блокировки
      Object.values(userLimit).forEach(limit => {
        limit.resetTime = blockUntil;
        limit.count = securityConfig.rateLimiting.maxRequests;
      });
    }
    
    console.warn(`User ${userId} temporarily blocked for ${duration}ms`);
  }

  /**
   * Получение статистики
   */
  getStats(): {
    totalRequests: number;
    blockedRequests: number;
    uniqueUsers: number;
    blockRate: number;
    activeUsers: number;
  } {
    return {
      totalRequests: this.globalStats.totalRequests,
      blockedRequests: this.globalStats.blockedRequests,
      uniqueUsers: this.globalStats.uniqueUsers.size,
      blockRate: this.globalStats.totalRequests > 0 
        ? (this.globalStats.blockedRequests / this.globalStats.totalRequests) * 100 
        : 0,
      activeUsers: this.userLimits.size
    };
  }

  /**
   * Сброс статистики
   */
  resetStats(): void {
    this.globalStats = {
      totalRequests: 0,
      blockedRequests: 0,
      uniqueUsers: new Set<number>()
    };
  }

  /**
   * Создание лимитов для нового пользователя
   */
  private createUserLimit(now: number, windowMs: number): UserRateLimit {
    const resetTime = now + windowMs;
    
    return {
      requests: { count: 0, resetTime, firstRequest: now },
      commands: { count: 0, resetTime, firstRequest: now },
      messages: { count: 0, resetTime, firstRequest: now },
      callbacks: { count: 0, resetTime, firstRequest: now }
    };
  }

  /**
   * Очистка устаревших записей
   */
  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [userId, userLimit] of this.userLimits.entries()) {
      // Удаляем записи, которые не обновлялись более 10 минут
      const oldestReset = Math.min(
        userLimit.requests.resetTime,
        userLimit.commands.resetTime,
        userLimit.messages.resetTime,
        userLimit.callbacks.resetTime
      );

      if (now > oldestReset + 600000) { // 10 минут
        this.userLimits.delete(userId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`Rate limit cleanup: removed ${cleanedCount} inactive users`);
    }
  }
}

// Создаем единственный экземпляр
export const rateLimitService = RateLimitService.getInstance();

/**
 * Middleware для rate limiting
 */
export function rateLimitMiddleware() {
  return async (ctx: AuthContext, next: () => Promise<void>) => {
    const userId = ctx.from?.id;
    
    if (!userId) {
      return next();
    }

    // Определяем тип запроса
    let requestType: 'requests' | 'commands' | 'messages' | 'callbacks' = 'requests';
    
    if (ctx.updateType === 'callback_query') {
      requestType = 'callbacks';
    } else if ('text' in ctx.message && ctx.message.text?.startsWith('/')) {
      requestType = 'commands';
    } else if (ctx.message) {
      requestType = 'messages';
    }

    // Проверяем лимит
    const limitCheck = rateLimitService.checkLimit(userId, requestType);
    
    if (!limitCheck.allowed) {
      console.warn(`Rate limit exceeded for user ${userId}, type: ${requestType}`);
      
      // Отправляем сообщение о превышении лимита
      const retryAfter = limitCheck.retryAfter || 60;
      await ctx.reply(
        `⚠️ Слишком много запросов. Попробуйте снова через ${retryAfter} секунд.`
      );
      
      return; // Не вызываем next()
    }

    // Проверяем на подозрительную активность
    const suspiciousCheck = rateLimitService.checkSuspiciousActivity(userId);
    
    if (suspiciousCheck.isSuspicious) {
      console.warn(`Suspicious activity detected for user ${userId}: ${suspiciousCheck.reason}`);
      
      if (suspiciousCheck.severity === 'high') {
        // Блокируем пользователя на 5 минут
        rateLimitService.blockUser(userId, 300000);
        await ctx.reply('🚫 Обнаружена подозрительная активность. Доступ временно ограничен.');
        return;
      } else if (suspiciousCheck.severity === 'medium') {
        // Предупреждаем пользователя
        await ctx.reply('⚠️ Пожалуйста, используйте бота умеренно.');
      }
    }

    // Добавляем информацию о лимитах в контекст
    (ctx as any).rateLimit = {
      remaining: limitCheck.remaining,
      resetTime: limitCheck.resetTime,
      type: requestType
    };

    await next();
  };
}

/**
 * Middleware для логирования rate limit статистики
 */
export function rateLimitStatsMiddleware() {
  return async (ctx: AuthContext, next: () => Promise<void>) => {
    await next();
    
    // Логируем статистику каждые 100 запросов
    const stats = rateLimitService.getStats();
    if (stats.totalRequests % 100 === 0) {
      console.log('Rate limit stats:', stats);
    }
  };
}

/**
 * Утилиты для работы с rate limiting
 */
export class RateLimitUtils {
  /**
   * Проверка, заблокирован ли пользователь
   */
  static isUserBlocked(userId: number): boolean {
    const check = rateLimitService.checkLimit(userId);
    return !check.allowed && (check.retryAfter || 0) > 30; // Блокировка более 30 секунд
  }

  /**
   * Получение времени до разблокировки
   */
  static getTimeUntilUnblock(userId: number): number {
    const check = rateLimitService.checkLimit(userId);
    return check.retryAfter || 0;
  }

  /**
   * Ручная блокировка пользователя (для админов)
   */
  static blockUser(userId: number, duration: number): void {
    rateLimitService.blockUser(userId, duration);
  }

  /**
   * Получение статистики rate limiting
   */
  static getStats() {
    return rateLimitService.getStats();
  }

  /**
   * Сброс статистики
   */
  static resetStats(): void {
    rateLimitService.resetStats();
  }
} 