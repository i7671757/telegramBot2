import { logger } from './logger';

interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class Cache {
  private cache = new Map<string, CacheItem<any>>();
  private defaultTTL: number;

  constructor(defaultTTL: number = 300000) { // 5 минут по умолчанию
    this.defaultTTL = defaultTTL;
    
    // Очистка устаревших записей каждые 10 минут
    setInterval(() => this.cleanup(), 600000);
  }

  /**
   * Сохранение данных в кэш
   */
  set<T>(key: string, data: T, ttl?: number): void {
    const item: CacheItem<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL
    };

    this.cache.set(key, item);
    logger.debug(`Cache set: ${key}`, { ttl: item.ttl });
  }

  /**
   * Получение данных из кэша
   */
  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    
    if (!item) {
      logger.debug(`Cache miss: ${key}`);
      return null;
    }

    // Проверяем, не истек ли TTL
    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      logger.debug(`Cache expired: ${key}`);
      return null;
    }

    logger.debug(`Cache hit: ${key}`);
    return item.data as T;
  }

  /**
   * Удаление записи из кэша
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      logger.debug(`Cache deleted: ${key}`);
    }
    return deleted;
  }

  /**
   * Очистка всего кэша
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    logger.info(`Cache cleared: ${size} items removed`);
  }

  /**
   * Получение или установка данных (с функцией загрузки)
   */
  async getOrSet<T>(
    key: string, 
    loader: () => Promise<T>, 
    ttl?: number
  ): Promise<T> {
    const cached = this.get<T>(key);
    
    if (cached !== null) {
      return cached;
    }

    try {
      const data = await loader();
      this.set(key, data, ttl);
      return data;
    } catch (error) {
      logger.error(`Cache loader failed for key: ${key}`, error);
      throw error;
    }
  }

  /**
   * Очистка устаревших записей
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > item.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`Cache cleanup: ${cleaned} expired items removed`);
    }
  }

  /**
   * Получение статистики кэша
   */
  getStats() {
    const now = Date.now();
    let expired = 0;
    let active = 0;

    for (const item of this.cache.values()) {
      if (now - item.timestamp > item.ttl) {
        expired++;
      } else {
        active++;
      }
    }

    return {
      total: this.cache.size,
      active,
      expired,
      memoryUsage: this.getMemoryUsage()
    };
  }

  private getMemoryUsage(): string {
    const size = JSON.stringify([...this.cache.entries()]).length;
    return `${(size / 1024).toFixed(2)} KB`;
  }
}

// Специализированные кэши для разных типов данных
export const apiCache = new Cache(300000); // 5 минут для API
export const userCache = new Cache(1800000); // 30 минут для пользовательских данных
export const staticCache = new Cache(3600000); // 1 час для статических данных

// Утилиты для кэширования API запросов
export class ApiCacheHelper {
  /**
   * Кэширование городов
   */
  static async getCities(): Promise<any[]> {
    return apiCache.getOrSet('cities', async () => {
      const response = await fetch(`${process.env.API_URL}cities/public`);
      const data = await response.json() as any;
      return data.data || [];
    });
  }

  /**
   * Кэширование терминалов
   */
  static async getTerminals(): Promise<any[]> {
    return apiCache.getOrSet('terminals', async () => {
      const response = await fetch(`${process.env.API_URL}terminals`);
      const data = await response.json() as any;
      return data.data || [];
    });
  }

  /**
   * Кэширование категорий
   */
  static async getCategories(): Promise<any[]> {
    return apiCache.getOrSet('categories', async () => {
      const response = await fetch(`${process.env.API_URL}categories/root`);
      const data = await response.json() as any;
      return data.data || [];
    });
  }

  /**
   * Кэширование продуктов по категории
   */
  static async getProductsByCategory(categoryId: number): Promise<any[]> {
    return apiCache.getOrSet(`products_${categoryId}`, async () => {
      const response = await fetch(`${process.env.API_URL}category/${categoryId}/products`);
      const data = await response.json() as any;
      return data.data || [];
    }, 600000); // 10 минут для продуктов
  }

  /**
   * Инвалидация кэша при обновлении данных
   */
  static invalidateProductCache(categoryId?: number) {
    if (categoryId) {
      apiCache.delete(`products_${categoryId}`);
    } else {
      // Удаляем все кэши продуктов
      for (const key of [...apiCache['cache'].keys()]) {
        if (key.startsWith('products_')) {
          apiCache.delete(key);
        }
      }
    }
  }
}

export { Cache }; 