import { logger } from '../utils/logger';
import { sessionService } from './SessionService';
import type { UserSession } from './SessionService';

interface MemoryStats {
  totalSessions: number;
  totalMemoryUsage: number;
  averageSessionSize: number;
  largestSessionSize: number;
  oldestSessionAge: number;
  sessionsWithLargeData: number;
}

interface SessionOptimizationResult {
  originalSize: number;
  optimizedSize: number;
  compressionRatio: number;
  removedFields: string[];
}

interface CleanupResult {
  totalCleaned: number;
  memorySaved: number;
  sessionsOptimized: number;
  oldSessionsRemoved: number;
}

export class MemoryManager {
  private static instance: MemoryManager;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private memoryThreshold = 50 * 1024 * 1024; // 50MB
  private sessionSizeThreshold = 100 * 1024; // 100KB per session
  private maxSessionAge = 7 * 24 * 60 * 60 * 1000; // 7 дней
  private maxInactiveAge = 24 * 60 * 60 * 1000; // 24 часа неактивности

  private constructor() {
    this.startPeriodicCleanup();
    this.monitorMemoryUsage();
  }

  static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }

  /**
   * Оптимизация сессии - удаление избыточных данных
   */
  optimizeSession(session: UserSession): { session: UserSession; result: SessionOptimizationResult } {
    const originalSession = JSON.stringify(session);
    const originalSize = Buffer.byteLength(originalSession, 'utf8');
    const removedFields: string[] = [];

    // Создаем копию для оптимизации
    const optimizedSession = { ...session };

    // Удаляем большие временные объекты
    if ((optimizedSession as any).products) {
      removedFields.push('products');
      delete (optimizedSession as any).products;
    }

    if ((optimizedSession as any).selectedProduct) {
      // Оставляем только ID и основную информацию
      const product = (optimizedSession as any).selectedProduct;
      (optimizedSession as any).selectedProduct = {
        id: product.id,
        name: product.custom_name || product.attribute_data?.name?.chopar?.ru,
        price: product.price
      };
      removedFields.push('selectedProduct.details');
    }

    if ((optimizedSession as any).selectedCategory) {
      // Оставляем только ID и название
      const category = (optimizedSession as any).selectedCategory;
      (optimizedSession as any).selectedCategory = {
        id: category.id,
        name: category.attribute_data?.name?.chopar?.ru,
        icon: category.icon
      };
      removedFields.push('selectedCategory.details');
    }

    // Очищаем productQuantities если слишком большой
    if ((optimizedSession as any).productQuantities) {
      const quantities = (optimizedSession as any).productQuantities;
      const quantityCount = Object.keys(quantities).length;
      if (quantityCount > 50) {
        // Оставляем только последние 20 продуктов
        const entries = Object.entries(quantities);
        const recent = entries.slice(-20);
        (optimizedSession as any).productQuantities = Object.fromEntries(recent);
        removedFields.push('productQuantities.old');
      }
    }

    // Удаляем устаревшие временные данные
    const temporaryFields = [
      'expectingTimeSlotSelection',
      'expectingAdditionalPhone', 
      'expectingCutleryChoice',
      'expectingOrderConfirmation',
      'step',
      'previousScene'
    ];

    temporaryFields.forEach(field => {
      if ((optimizedSession as any)[field] !== undefined) {
        delete (optimizedSession as any)[field];
        removedFields.push(field);
      }
    });

    // Оптимизируем корзину
    if (optimizedSession.cart?.items) {
      optimizedSession.cart.items = optimizedSession.cart.items.map(item => ({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity
      }));
    }

    const optimizedSize = Buffer.byteLength(JSON.stringify(optimizedSession), 'utf8');
    const compressionRatio = ((originalSize - optimizedSize) / originalSize) * 100;

    return {
      session: optimizedSession,
      result: {
        originalSize,
        optimizedSize,
        compressionRatio,
        removedFields
      }
    };
  }

  /**
   * Проверка размера сессии
   */
  checkSessionSize(session: UserSession): { isLarge: boolean; size: number; recommendations: string[] } {
    const sessionString = JSON.stringify(session);
    const size = Buffer.byteLength(sessionString, 'utf8');
    const isLarge = size > this.sessionSizeThreshold;
    const recommendations: string[] = [];

    if (isLarge) {
      // Анализируем что занимает место
      if ((session as any).products) {
        recommendations.push('Удалить кэшированные продукты из сессии');
      }
      
      if ((session as any).selectedProduct && JSON.stringify((session as any).selectedProduct).length > 1000) {
        recommendations.push('Упростить данные выбранного продукта');
      }

      if ((session as any).productQuantities && Object.keys((session as any).productQuantities).length > 30) {
        recommendations.push('Очистить старые количества продуктов');
      }

      if (session.cart?.items && session.cart.items.length > 20) {
        recommendations.push('Ограничить размер корзины');
      }
    }

    return { isLarge, size, recommendations };
  }

  /**
   * Полная очистка памяти
   */
  async performFullCleanup(): Promise<CleanupResult> {
    logger.info('Starting full memory cleanup...');
    
    const result: CleanupResult = {
      totalCleaned: 0,
      memorySaved: 0,
      sessionsOptimized: 0,
      oldSessionsRemoved: 0
    };

    try {
      // Получаем все сессии
      const allSessions = await sessionService.getAllSessions();
      const now = Date.now();

      for (const sessionData of allSessions) {
        const sessionKey = sessionData.id;
        const session = sessionData.data;
        
        // Проверяем возраст сессии
        const lastActivity = this.getLastActivity(session);
        const sessionAge = now - lastActivity;

        // Удаляем очень старые сессии
        if (sessionAge > this.maxSessionAge) {
          const [userId, chatId] = sessionKey.split(':').map(Number);
          await sessionService.deleteSession(userId, chatId);
          result.oldSessionsRemoved++;
          continue;
        }

        // Оптимизируем большие сессии
        const sizeCheck = this.checkSessionSize(session);
        if (sizeCheck.isLarge) {
          const optimization = this.optimizeSession(session);
          
          if (optimization.result.compressionRatio > 10) {
            const [userId, chatId] = sessionKey.split(':').map(Number);
            await sessionService.saveSession(userId, chatId, optimization.session);
            
            result.sessionsOptimized++;
            result.memorySaved += optimization.result.originalSize - optimization.result.optimizedSize;
            
            logger.info(`Optimized session ${sessionKey}`, {
              originalSize: optimization.result.originalSize,
              optimizedSize: optimization.result.optimizedSize,
              compressionRatio: optimization.result.compressionRatio.toFixed(2) + '%',
              removedFields: optimization.result.removedFields
            });
          }
        }
      }

      result.totalCleaned = result.oldSessionsRemoved + result.sessionsOptimized;
      
      logger.info('Memory cleanup completed', result);
      return result;

    } catch (error) {
      logger.error('Error during memory cleanup', error);
      throw error;
    }
  }

  /**
   * Получение статистики использования памяти
   */
  async getMemoryStats(): Promise<MemoryStats> {
    try {
      const allSessions = await sessionService.getAllSessions();
      const now = Date.now();
      
      let totalMemoryUsage = 0;
      let largestSessionSize = 0;
      let oldestSessionAge = 0;
      let sessionsWithLargeData = 0;

      for (const sessionData of allSessions) {
        const sessionString = JSON.stringify(sessionData.data);
        const sessionSize = Buffer.byteLength(sessionString, 'utf8');
        
        totalMemoryUsage += sessionSize;
        largestSessionSize = Math.max(largestSessionSize, sessionSize);
        
        if (sessionSize > this.sessionSizeThreshold) {
          sessionsWithLargeData++;
        }

        const lastActivity = this.getLastActivity(sessionData.data);
        const sessionAge = now - lastActivity;
        oldestSessionAge = Math.max(oldestSessionAge, sessionAge);
      }

      return {
        totalSessions: allSessions.length,
        totalMemoryUsage,
        averageSessionSize: allSessions.length > 0 ? totalMemoryUsage / allSessions.length : 0,
        largestSessionSize,
        oldestSessionAge,
        sessionsWithLargeData
      };

    } catch (error) {
      logger.error('Error getting memory stats', error);
      throw error;
    }
  }

  /**
   * Автоматическая оптимизация сессии при сохранении
   */
  async autoOptimizeSession(userId: number, chatId: number, session: UserSession): Promise<UserSession> {
    const sizeCheck = this.checkSessionSize(session);
    
    if (sizeCheck.isLarge) {
      logger.warn(`Large session detected for user ${userId}:${chatId}`, {
        size: sizeCheck.size,
        threshold: this.sessionSizeThreshold,
        recommendations: sizeCheck.recommendations
      });

      const optimization = this.optimizeSession(session);
      
      if (optimization.result.compressionRatio > 20) {
        logger.info(`Auto-optimized session for user ${userId}:${chatId}`, {
          compressionRatio: optimization.result.compressionRatio.toFixed(2) + '%',
          memorySaved: optimization.result.originalSize - optimization.result.optimizedSize
        });
        
        return optimization.session;
      }
    }

    return session;
  }

  /**
   * Очистка неактивных сессий
   */
  async cleanupInactiveSessions(): Promise<number> {
    const allSessions = await sessionService.getAllSessions();
    const now = Date.now();
    let cleanedCount = 0;

    for (const sessionData of allSessions) {
      const lastActivity = this.getLastActivity(sessionData.data);
      const inactiveTime = now - lastActivity;

      if (inactiveTime > this.maxInactiveAge) {
        const [userId, chatId] = sessionData.id.split(':').map(Number);
        await sessionService.deleteSession(userId, chatId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} inactive sessions`);
    }

    return cleanedCount;
  }

  /**
   * Мониторинг использования памяти системы
   */
  private monitorMemoryUsage(): void {
    setInterval(async () => {
      const memoryUsage = process.memoryUsage();
      const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
      
      // Предупреждение при высоком использовании памяти
      if (heapUsedMB > 400) {
        logger.warn(`High memory usage detected: ${heapUsedMB.toFixed(2)}MB`);
        
        // Автоматическая очистка при критическом использовании
        if (heapUsedMB > 600) {
          logger.warn('Critical memory usage, starting emergency cleanup...');
          await this.performFullCleanup();
        }
      }

      // Логируем статистику каждые 10 минут
      const stats = await this.getMemoryStats();
      logger.debug('Memory stats', {
        systemMemory: `${heapUsedMB.toFixed(2)}MB`,
        sessionMemory: `${(stats.totalMemoryUsage / 1024 / 1024).toFixed(2)}MB`,
        totalSessions: stats.totalSessions,
        largeSessionsCount: stats.sessionsWithLargeData
      });

    }, 600000); // Каждые 10 минут
  }

  /**
   * Периодическая очистка
   */
  private startPeriodicCleanup(): void {
    // Очистка каждые 6 часов
    this.cleanupInterval = setInterval(async () => {
      try {
        logger.info('Starting periodic memory cleanup...');
        
        // Очищаем неактивные сессии
        await this.cleanupInactiveSessions();
        
        // Проверяем общее использование памяти
        const stats = await this.getMemoryStats();
        const memoryUsageMB = stats.totalMemoryUsage / 1024 / 1024;
        
        // Если использование памяти высокое, запускаем полную очистку
        if (memoryUsageMB > 10 || stats.sessionsWithLargeData > 5) {
          await this.performFullCleanup();
        }
        
      } catch (error) {
        logger.error('Error in periodic cleanup', error);
      }
    }, 6 * 60 * 60 * 1000); // 6 часов
  }

  /**
   * Получение времени последней активности сессии
   */
  private getLastActivity(session: UserSession): number {
    // Проверяем различные поля для определения последней активности
    const timestamps = [];
    
    if (session.cart?.updatedAt) {
      timestamps.push(new Date(session.cart.updatedAt).getTime());
    }
    
    if (session.lastOtpSent) {
      timestamps.push(session.lastOtpSent);
    }

    // Если нет временных меток, считаем что сессия старая
    return timestamps.length > 0 ? Math.max(...timestamps) : Date.now() - this.maxSessionAge;
  }

  /**
   * Настройка параметров управления памятью
   */
  configure(options: {
    memoryThreshold?: number;
    sessionSizeThreshold?: number;
    maxSessionAge?: number;
    maxInactiveAge?: number;
  }): void {
    if (options.memoryThreshold) this.memoryThreshold = options.memoryThreshold;
    if (options.sessionSizeThreshold) this.sessionSizeThreshold = options.sessionSizeThreshold;
    if (options.maxSessionAge) this.maxSessionAge = options.maxSessionAge;
    if (options.maxInactiveAge) this.maxInactiveAge = options.maxInactiveAge;

    logger.info('Memory manager configuration updated', {
      memoryThreshold: `${(this.memoryThreshold / 1024 / 1024).toFixed(2)}MB`,
      sessionSizeThreshold: `${(this.sessionSizeThreshold / 1024).toFixed(2)}KB`,
      maxSessionAge: `${(this.maxSessionAge / 1000 / 60 / 60 / 24).toFixed(1)} days`,
      maxInactiveAge: `${(this.maxInactiveAge / 1000 / 60 / 60).toFixed(1)} hours`
    });
  }

  /**
   * Остановка мониторинга
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Принудительная сборка мусора (если доступна)
   */
  forceGarbageCollection(): void {
    if (global.gc) {
      global.gc();
      logger.info('Forced garbage collection completed');
    } else {
      logger.warn('Garbage collection not available (run with --expose-gc flag)');
    }
  }
}

// Создаем единственный экземпляр
export const memoryManager = MemoryManager.getInstance(); 