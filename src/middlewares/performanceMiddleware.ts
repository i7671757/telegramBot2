import type { Context, MiddlewareFn } from 'telegraf';
import { logger } from '../utils/logger';
import { asyncTaskManager } from '../services/AsyncTaskManager';

interface PerformanceMetrics {
  requestCount: number;
  totalResponseTime: number;
  avgResponseTime: number;
  slowRequests: number;
  errorCount: number;
  memoryUsage: NodeJS.MemoryUsage;
  lastUpdated: number;
}

interface RequestMetrics {
  startTime: number;
  updateType: string;
  userId?: number;
  chatId?: number;
  command?: string;
}

class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetrics = {
    requestCount: 0,
    totalResponseTime: 0,
    avgResponseTime: 0,
    slowRequests: 0,
    errorCount: 0,
    memoryUsage: process.memoryUsage(),
    lastUpdated: Date.now()
  };
  
  private requestHistory: Array<{
    timestamp: number;
    responseTime: number;
    updateType: string;
    success: boolean;
  }> = [];

  private slowRequestThreshold = 2000; // 2 секунды
  private maxHistorySize = 1000;

  private constructor() {
    this.startMemoryMonitoring();
    this.startPeriodicCleanup();
  }

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Начало отслеживания запроса
   */
  startRequest(ctx: Context): RequestMetrics {
    const requestMetrics: RequestMetrics = {
      startTime: Date.now(),
      updateType: this.getUpdateType(ctx),
      userId: ctx.from?.id,
      chatId: ctx.chat?.id
    };

    // Определяем команду если есть
    if (ctx.message && 'text' in ctx.message && ctx.message.text?.startsWith('/')) {
      requestMetrics.command = ctx.message.text.split(' ')[0];
    }

    return requestMetrics;
  }

  /**
   * Завершение отслеживания запроса
   */
  endRequest(requestMetrics: RequestMetrics, success: boolean = true): void {
    const responseTime = Date.now() - requestMetrics.startTime;
    
    // Обновляем метрики
    this.metrics.requestCount++;
    this.metrics.totalResponseTime += responseTime;
    this.metrics.avgResponseTime = this.metrics.totalResponseTime / this.metrics.requestCount;
    this.metrics.lastUpdated = Date.now();

    if (!success) {
      this.metrics.errorCount++;
    }

    if (responseTime > this.slowRequestThreshold) {
      this.metrics.slowRequests++;
      logger.warn(`Slow request detected`, {
        responseTime: `${responseTime}ms`,
        updateType: requestMetrics.updateType,
        userId: requestMetrics.userId,
        command: requestMetrics.command
      });
    }

    // Добавляем в историю
    this.requestHistory.push({
      timestamp: Date.now(),
      responseTime,
      updateType: requestMetrics.updateType,
      success
    });

    // Ограничиваем размер истории
    if (this.requestHistory.length > this.maxHistorySize) {
      this.requestHistory = this.requestHistory.slice(-this.maxHistorySize / 2);
    }

    // Логируем детали запроса
    logger.debug(`Request completed`, {
      responseTime: `${responseTime}ms`,
      updateType: requestMetrics.updateType,
      userId: requestMetrics.userId,
      success
    });
  }

  /**
   * Получение текущих метрик
   */
  getMetrics(): PerformanceMetrics & {
    recentRequests: number;
    errorRate: string;
    slowRequestRate: string;
    requestsPerMinute: number;
  } {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    const recentRequests = this.requestHistory.filter(
      req => req.timestamp > oneMinuteAgo
    ).length;

    return {
      ...this.metrics,
      recentRequests,
      errorRate: this.metrics.requestCount > 0 
        ? ((this.metrics.errorCount / this.metrics.requestCount) * 100).toFixed(2) + '%'
        : '0%',
      slowRequestRate: this.metrics.requestCount > 0
        ? ((this.metrics.slowRequests / this.metrics.requestCount) * 100).toFixed(2) + '%'
        : '0%',
      requestsPerMinute: recentRequests
    };
  }

  /**
   * Получение детальной статистики
   */
  getDetailedStats() {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const recentHistory = this.requestHistory.filter(req => req.timestamp > oneHourAgo);

    // Группировка по типам обновлений
    const updateTypeStats = recentHistory.reduce((acc, req) => {
      if (!acc[req.updateType]) {
        acc[req.updateType] = { count: 0, totalTime: 0, errors: 0 };
      }
      acc[req.updateType].count++;
      acc[req.updateType].totalTime += req.responseTime;
      if (!req.success) acc[req.updateType].errors++;
      return acc;
    }, {} as Record<string, { count: number; totalTime: number; errors: number }>);

    // Вычисляем средние времена
    Object.keys(updateTypeStats).forEach(type => {
      const stats = updateTypeStats[type];
      (stats as any).avgTime = stats.totalTime / stats.count;
      (stats as any).errorRate = ((stats.errors / stats.count) * 100).toFixed(2) + '%';
    });

    return {
      general: this.getMetrics(),
      updateTypes: updateTypeStats,
      taskManager: asyncTaskManager.getStats(),
      system: {
        uptime: process.uptime(),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      }
    };
  }

  /**
   * Сброс метрик
   */
  resetMetrics(): void {
    this.metrics = {
      requestCount: 0,
      totalResponseTime: 0,
      avgResponseTime: 0,
      slowRequests: 0,
      errorCount: 0,
      memoryUsage: process.memoryUsage(),
      lastUpdated: Date.now()
    };
    this.requestHistory = [];
    logger.info('Performance metrics reset');
  }

  /**
   * Определение типа обновления
   */
  private getUpdateType(ctx: Context): string {
    if (ctx.message) {
      if ('text' in ctx.message) {
        if (ctx.message.text?.startsWith('/')) return 'command';
        return 'text_message';
      }
      if ('photo' in ctx.message) return 'photo';
      if ('document' in ctx.message) return 'document';
      if ('contact' in ctx.message) return 'contact';
      if ('location' in ctx.message) return 'location';
      return 'other_message';
    }
    if (ctx.callbackQuery) return 'callback_query';
    if (ctx.inlineQuery) return 'inline_query';
    return 'unknown';
  }

  /**
   * Мониторинг памяти
   */
  private startMemoryMonitoring(): void {
    setInterval(() => {
      this.metrics.memoryUsage = process.memoryUsage();
      
      // Предупреждение при высоком использовании памяти
      const heapUsedMB = this.metrics.memoryUsage.heapUsed / 1024 / 1024;
      if (heapUsedMB > 500) { // 500MB
        logger.warn(`High memory usage detected: ${heapUsedMB.toFixed(2)}MB`);
      }
    }, 30000); // Каждые 30 секунд
  }

  /**
   * Периодическая очистка старых данных
   */
  private startPeriodicCleanup(): void {
    setInterval(() => {
      const oneHourAgo = Date.now() - 3600000;
      const initialLength = this.requestHistory.length;
      
      this.requestHistory = this.requestHistory.filter(
        req => req.timestamp > oneHourAgo
      );

      const cleaned = initialLength - this.requestHistory.length;
      if (cleaned > 0) {
        logger.debug(`Cleaned up ${cleaned} old performance records`);
      }
    }, 600000); // Каждые 10 минут
  }

  /**
   * Настройка порога медленных запросов
   */
  setSlowRequestThreshold(ms: number): void {
    this.slowRequestThreshold = Math.max(100, ms);
    logger.info(`Slow request threshold set to ${this.slowRequestThreshold}ms`);
  }
}

// Создаем единственный экземпляр
const performanceMonitor = PerformanceMonitor.getInstance();

/**
 * Middleware для мониторинга производительности
 */
export function performanceMiddleware(): MiddlewareFn<Context> {
  return async (ctx, next) => {
    const requestMetrics = performanceMonitor.startRequest(ctx);
    let success = true;

    try {
      await next();
    } catch (error) {
      success = false;
      throw error;
    } finally {
      performanceMonitor.endRequest(requestMetrics, success);
    }
  };
}

/**
 * Middleware для логирования медленных операций
 */
export function slowOperationLogger(thresholdMs: number = 1000): MiddlewareFn<Context> {
  return async (ctx, next) => {
    const startTime = Date.now();
    
    try {
      await next();
    } finally {
      const duration = Date.now() - startTime;
      if (duration > thresholdMs) {
        logger.warn(`Slow operation detected`, {
          duration: `${duration}ms`,
          updateType: ctx.updateType,
          userId: ctx.from?.id,
          chatId: ctx.chat?.id
        });
      }
    }
  };
}

/**
 * Получение экземпляра монитора производительности
 */
export function getPerformanceMonitor(): PerformanceMonitor {
  return performanceMonitor;
}

/**
 * Экспорт для использования в других модулях
 */
export { performanceMonitor }; 