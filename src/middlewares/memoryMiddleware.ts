import { memoryManager } from '../services/MemoryManager';
import { logger } from '../utils/logger';
import type { AuthContext } from './auth';

interface MemoryMiddlewareOptions {
  checkInterval?: number; // Интервал проверки в миллисекундах
  memoryThreshold?: number; // Порог использования памяти в байтах
  autoCleanup?: boolean; // Автоматическая очистка
  logStats?: boolean; // Логирование статистики
}

/**
 * Middleware для мониторинга и управления памятью
 */
export function memoryMiddleware(options: MemoryMiddlewareOptions = {}) {
  const {
    checkInterval = 10 * 60 * 1000, // 10 минут
    memoryThreshold = 100 * 1024 * 1024, // 100MB
    autoCleanup = true,
    logStats = true
  } = options;

  let lastCheck = 0;
  let requestCount = 0;

  return async (ctx: AuthContext, next: () => Promise<void>) => {
    requestCount++;
    const now = Date.now();

    // Проверяем память периодически
    if (now - lastCheck > checkInterval) {
      lastCheck = now;

      try {
        // Получаем статистику памяти
        const memoryUsage = process.memoryUsage();
        const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
        const sessionStats = await memoryManager.getMemoryStats();

        if (logStats) {
          logger.debug('Memory middleware stats', {
            systemMemory: `${heapUsedMB.toFixed(2)}MB`,
            sessionMemory: `${(sessionStats.totalMemoryUsage / 1024 / 1024).toFixed(2)}MB`,
            totalSessions: sessionStats.totalSessions,
            largeSessionsCount: sessionStats.sessionsWithLargeData,
            requestCount
          });
        }

        // Проверяем превышение порога памяти
        if (memoryUsage.heapUsed > memoryThreshold) {
          logger.warn('Memory threshold exceeded', {
            current: `${heapUsedMB.toFixed(2)}MB`,
            threshold: `${(memoryThreshold / 1024 / 1024).toFixed(2)}MB`,
            sessionMemory: `${(sessionStats.totalMemoryUsage / 1024 / 1024).toFixed(2)}MB`
          });

          if (autoCleanup) {
            logger.info('Starting automatic memory cleanup...');
            const cleanupResult = await memoryManager.performFullCleanup();
            
            logger.info('Automatic cleanup completed', {
              sessionsOptimized: cleanupResult.sessionsOptimized,
              oldSessionsRemoved: cleanupResult.oldSessionsRemoved,
              memorySaved: `${(cleanupResult.memorySaved / 1024 / 1024).toFixed(2)}MB`
            });
          }
        }

        // Принудительная сборка мусора при критическом использовании
        if (heapUsedMB > 500) {
          logger.warn('Critical memory usage, forcing garbage collection');
          memoryManager.forceGarbageCollection();
        }

      } catch (error) {
        logger.error('Error in memory middleware', error);
      }
    }

    // Продолжаем обработку запроса
    await next();

    // Проверяем размер сессии после обработки
    if (ctx.session && ctx.from?.id && ctx.chat?.id) {
      try {
        const sizeCheck = memoryManager.checkSessionSize(ctx.session as any);
        
        if (sizeCheck.isLarge) {
          logger.warn(`Large session detected after request`, {
            userId: ctx.from.id,
            chatId: ctx.chat.id,
            size: `${(sizeCheck.size / 1024).toFixed(2)}KB`,
            recommendations: sizeCheck.recommendations
          });
        }
      } catch (error) {
        logger.error('Error checking session size', error);
      }
    }
  };
}

/**
 * Простой middleware для логирования использования памяти
 */
export function memoryLoggerMiddleware() {
  let requestCount = 0;
  
  return async (ctx: AuthContext, next: () => Promise<void>) => {
    requestCount++;
    
    // Логируем каждые 100 запросов
    if (requestCount % 100 === 0) {
      const memoryUsage = process.memoryUsage();
      const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
      
      logger.info(`Memory usage after ${requestCount} requests: ${heapUsedMB.toFixed(2)}MB`);
    }
    
    await next();
  };
}

/**
 * Middleware для предотвращения утечек памяти в сессиях
 */
export function sessionMemoryGuard() {
  return async (ctx: AuthContext, next: () => Promise<void>) => {
    const originalSession = ctx.session ? { ...ctx.session } : null;
    
    await next();
    
    // Проверяем изменения в сессии после обработки
    if (ctx.session && originalSession) {
      const originalSize = Buffer.byteLength(JSON.stringify(originalSession), 'utf8');
      const currentSize = Buffer.byteLength(JSON.stringify(ctx.session), 'utf8');
      
      // Предупреждаем о значительном увеличении размера сессии
      if (currentSize > originalSize * 2 && currentSize > 50 * 1024) {
        logger.warn('Session size increased significantly', {
          userId: ctx.from?.id,
          chatId: ctx.chat?.id,
          originalSize: `${(originalSize / 1024).toFixed(2)}KB`,
          currentSize: `${(currentSize / 1024).toFixed(2)}KB`,
          increase: `${(((currentSize - originalSize) / originalSize) * 100).toFixed(2)}%`
        });
        
        // Автоматически оптимизируем сессию если она стала слишком большой
        if (currentSize > 100 * 1024) {
          const optimization = memoryManager.optimizeSession(ctx.session as any);
          if (optimization.result.compressionRatio > 20) {
            Object.assign(ctx.session, optimization.session);
            logger.info('Session auto-optimized', {
              userId: ctx.from?.id,
              compressionRatio: `${optimization.result.compressionRatio.toFixed(2)}%`
            });
          }
        }
      }
    }
  };
} 