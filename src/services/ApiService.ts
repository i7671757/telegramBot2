import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { securityConfig } from '../config/security';
import { logger } from '../utils/logger';

interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
  etag?: string;
}

interface PaginationOptions {
  page?: number;
  limit?: number;
  offset?: number;
}

interface ApiRequestOptions extends AxiosRequestConfig {
  cache?: boolean;
  cacheTTL?: number;
  retries?: number;
  timeout?: number;
  pagination?: PaginationOptions;
}

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export class ApiService {
  private static instance: ApiService;
  private axiosInstance: AxiosInstance;
  private cache = new Map<string, CacheItem<any>>();
  private requestQueue = new Map<string, Promise<any>>();
  private stats = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    errors: 0,
    avgResponseTime: 0,
    requestTimes: [] as number[]
  };

  private constructor() {
    this.axiosInstance = axios.create({
      baseURL: securityConfig.api.url,
      timeout: securityConfig.api.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TelegramBot/2.0'
      }
    });

    this.setupInterceptors();
    this.startCacheCleanup();
  }

  static getInstance(): ApiService {
    if (!ApiService.instance) {
      ApiService.instance = new ApiService();
    }
    return ApiService.instance;
  }

  /**
   * Настройка перехватчиков для логирования и обработки ошибок
   */
  private setupInterceptors(): void {
    // Перехватчик запросов
    this.axiosInstance.interceptors.request.use(
      (config) => {
        const startTime = Date.now();
        (config as any).startTime = startTime;
        
        logger.debug(`API Request: ${config.method?.toUpperCase()} ${config.url}`, {
          params: config.params,
          data: config.data
        });
        
        return config;
      },
      (error) => {
        this.stats.errors++;
        logger.error('API Request Error', error);
        return Promise.reject(error);
      }
    );

    // Перехватчик ответов
    this.axiosInstance.interceptors.response.use(
      (response) => {
        const endTime = Date.now();
        const startTime = (response.config as any).startTime;
        const responseTime = endTime - startTime;
        
        this.updateResponseTimeStats(responseTime);
        
        logger.debug(`API Response: ${response.status} ${response.config.url}`, {
          responseTime: `${responseTime}ms`,
          dataSize: JSON.stringify(response.data).length
        });
        
        return response;
      },
      (error) => {
        this.stats.errors++;
        const endTime = Date.now();
        const startTime = (error.config as any)?.startTime;
        const responseTime = startTime ? endTime - startTime : 0;
        
        logger.error(`API Error: ${error.response?.status || 'Network'} ${error.config?.url}`, {
          responseTime: `${responseTime}ms`,
          error: error.message
        });
        
        return Promise.reject(error);
      }
    );
  }

  /**
   * Основной метод для выполнения API запросов
   */
  async request<T>(
    url: string,
    options: ApiRequestOptions = {}
  ): Promise<T> {
    const {
      cache = true,
      cacheTTL = 300000, // 5 минут по умолчанию
      retries = 3,
      pagination,
      ...axiosOptions
    } = options;

    this.stats.totalRequests++;

    // Создаем ключ для кэша
    const cacheKey = this.createCacheKey(url, axiosOptions, pagination);

    // Проверяем кэш
    if (cache) {
      const cached = this.getFromCache<T>(cacheKey);
      if (cached !== null) {
        this.stats.cacheHits++;
        return cached;
      }
      this.stats.cacheMisses++;
    }

    // Проверяем, нет ли уже такого запроса в очереди (дедупликация)
    if (this.requestQueue.has(cacheKey)) {
      logger.debug(`Request deduplication: ${url}`);
      return this.requestQueue.get(cacheKey)!;
    }

    // Создаем промис для запроса
    const requestPromise = this.executeRequest<T>(url, axiosOptions, pagination, retries);
    
    // Добавляем в очередь
    this.requestQueue.set(cacheKey, requestPromise);

    try {
      const result = await requestPromise;
      
      // Кэшируем результат
      if (cache) {
        this.setCache(cacheKey, result, cacheTTL);
      }
      
      return result;
    } finally {
      // Удаляем из очереди
      this.requestQueue.delete(cacheKey);
    }
  }

  /**
   * Выполнение запроса с повторными попытками
   */
  private async executeRequest<T>(
    url: string,
    options: AxiosRequestConfig,
    pagination?: PaginationOptions,
    retries: number = 3
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // Добавляем параметры пагинации
        const config = { ...options };
        if (pagination) {
          config.params = {
            ...config.params,
            page: pagination.page || 1,
            limit: pagination.limit || 20,
            offset: pagination.offset
          };
        }

        const response: AxiosResponse<T> = await this.axiosInstance.request({
          url,
          ...config
        });

        return response.data;
      } catch (error: any) {
        lastError = error;
        
        // Не повторяем для клиентских ошибок (4xx)
        if (error.response?.status >= 400 && error.response?.status < 500) {
          break;
        }

        if (attempt < retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff
          logger.warn(`API request failed, retrying in ${delay}ms (attempt ${attempt}/${retries})`, {
            url,
            error: error.message
          });
          await this.delay(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * GET запрос с кэшированием
   */
  async get<T>(url: string, options: ApiRequestOptions = {}): Promise<T> {
    return this.request<T>(url, { ...options, method: 'GET' });
  }

  /**
   * POST запрос (обычно не кэшируется)
   */
  async post<T>(url: string, data?: any, options: ApiRequestOptions = {}): Promise<T> {
    return this.request<T>(url, { 
      ...options, 
      method: 'POST', 
      data,
      cache: false // POST запросы обычно не кэшируются
    });
  }

  /**
   * PUT запрос
   */
  async put<T>(url: string, data?: any, options: ApiRequestOptions = {}): Promise<T> {
    return this.request<T>(url, { 
      ...options, 
      method: 'PUT', 
      data,
      cache: false
    });
  }

  /**
   * DELETE запрос
   */
  async delete<T>(url: string, options: ApiRequestOptions = {}): Promise<T> {
    return this.request<T>(url, { 
      ...options, 
      method: 'DELETE',
      cache: false
    });
  }

  /**
   * Пагинированный GET запрос
   */
  async getPaginated<T>(
    url: string, 
    pagination: PaginationOptions = {},
    options: ApiRequestOptions = {}
  ): Promise<PaginatedResponse<T>> {
    const response = await this.get<any>(url, {
      ...options,
      pagination,
      cacheTTL: 60000 // Короткий кэш для пагинированных данных
    });

    // Предполагаем стандартный формат ответа
    const data = response.data || response;
    const meta = response.meta || response.pagination || {};

    return {
      data: Array.isArray(data) ? data : [data],
      pagination: {
        page: pagination.page || 1,
        limit: pagination.limit || 20,
        total: meta.total || data.length,
        totalPages: meta.totalPages || Math.ceil((meta.total || data.length) / (pagination.limit || 20)),
        hasNext: meta.hasNext || false,
        hasPrev: meta.hasPrev || false
      }
    };
  }

  /**
   * Неблокирующий запрос (fire-and-forget)
   */
  async requestAsync<T>(url: string, options: ApiRequestOptions = {}): Promise<void> {
    // Запускаем запрос в фоне, не ждем результата
    this.request<T>(url, options).catch(error => {
      logger.error(`Async request failed: ${url}`, error);
    });
  }

  /**
   * Пакетные запросы
   */
        async batchRequests<T>(requests: Array<{ url: string; options?: ApiRequestOptions }>): Promise<T[]> {
     const promises = requests.map(({ url, options = {} }): Promise<T | null> => 
       this.request<T>(url, options).catch((error): null => {
         logger.error(`Batch request failed: ${url}`, error);
         return null;
       })
     );

     const results = await Promise.all(promises);
     return results.filter((value): value is T => value !== null);
   }

  /**
   * Кэширование
   */
  private createCacheKey(url: string, options: AxiosRequestConfig, pagination?: PaginationOptions): string {
    const key = {
      url,
      method: options.method || 'GET',
      params: options.params,
      pagination
    };
    return Buffer.from(JSON.stringify(key)).toString('base64');
  }

  private getFromCache<T>(key: string): T | null {
    const item = this.cache.get(key);
    
    if (!item) {
      return null;
    }

    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return null;
    }

    return item.data as T;
  }

  private setCache<T>(key: string, data: T, ttl: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * Инвалидация кэша
   */
  invalidateCache(pattern?: string): void {
    if (!pattern) {
      this.cache.clear();
      logger.info('All cache invalidated');
      return;
    }

    let deleted = 0;
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        deleted++;
      }
    }

    logger.info(`Cache invalidated: ${deleted} items matching pattern "${pattern}"`);
  }

  /**
   * Очистка устаревшего кэша
   */
  private startCacheCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [key, item] of this.cache.entries()) {
        if (now - item.timestamp > item.ttl) {
          this.cache.delete(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        logger.debug(`Cache cleanup: ${cleaned} expired items removed`);
      }
    }, 300000); // Каждые 5 минут
  }

  /**
   * Обновление статистики времени ответа
   */
  private updateResponseTimeStats(responseTime: number): void {
    this.stats.requestTimes.push(responseTime);
    
    // Оставляем только последние 100 запросов для расчета среднего
    if (this.stats.requestTimes.length > 100) {
      this.stats.requestTimes = this.stats.requestTimes.slice(-100);
    }

    this.stats.avgResponseTime = this.stats.requestTimes.reduce((a, b) => a + b, 0) / this.stats.requestTimes.length;
  }

  /**
   * Получение статистики
   */
  getStats() {
    const cacheStats = {
      size: this.cache.size,
      hitRate: this.stats.totalRequests > 0 
        ? (this.stats.cacheHits / this.stats.totalRequests * 100).toFixed(2) + '%'
        : '0%'
    };

    return {
      requests: {
        total: this.stats.totalRequests,
        errors: this.stats.errors,
        errorRate: this.stats.totalRequests > 0 
          ? (this.stats.errors / this.stats.totalRequests * 100).toFixed(2) + '%'
          : '0%',
        avgResponseTime: Math.round(this.stats.avgResponseTime) + 'ms'
      },
      cache: {
        ...cacheStats,
        hits: this.stats.cacheHits,
        misses: this.stats.cacheMisses
      },
      queue: {
        activeRequests: this.requestQueue.size
      }
    };
  }

  /**
   * Сброс статистики
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0,
      avgResponseTime: 0,
      requestTimes: []
    };
  }

  /**
   * Утилита для задержки
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Создаем единственный экземпляр
export const apiService = ApiService.getInstance(); 