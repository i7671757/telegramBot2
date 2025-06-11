import { apiService } from './ApiService';
import { logger } from '../utils/logger';

export interface City {
  id: number;
  name: string;
  name_uz?: string;
  name_ru?: string;
  name_en?: string;
  is_active: boolean;
}

export interface Terminal {
  id: number;
  name: string;
  address: string;
  city_id: number;
  latitude?: number;
  longitude?: number;
  is_active: boolean;
}

export interface Category {
  id: number;
  name: string;
  description?: string;
  image?: string;
  parent_id?: number;
  is_active: boolean;
}

export interface Product {
  id: number;
  name: string;
  description?: string;
  price: number;
  image?: string;
  category_id: number;
  is_active: boolean;
  attributes?: any;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * Оптимизированные API хелперы с кэшированием
 */
export class OptimizedApiHelpers {
  private static instance: OptimizedApiHelpers;

  private constructor() {}

  static getInstance(): OptimizedApiHelpers {
    if (!OptimizedApiHelpers.instance) {
      OptimizedApiHelpers.instance = new OptimizedApiHelpers();
    }
    return OptimizedApiHelpers.instance;
  }

  /**
   * Получение списка городов с кэшированием
   */
  async getCities(): Promise<City[]> {
    try {
      const response = await apiService.get<ApiResponse<City[]>>('cities/public', {
        cacheTTL: 3600000, // 1 час - города редко меняются
        retries: 2
      });

      if (response.success) {
        return response.data;
      } else {
        logger.warn('API returned unsuccessful response for cities', response);
        return [];
      }
    } catch (error) {
      logger.error('Failed to fetch cities', error);
      return [];
    }
  }

  /**
   * Получение терминалов с кэшированием
   */
  async getTerminals(cityId?: number): Promise<Terminal[]> {
    try {
      const url = cityId ? `terminals?city_id=${cityId}` : 'terminals';
      const cacheKey = cityId ? `terminals_city_${cityId}` : 'terminals_all';
      
      const response = await apiService.get<ApiResponse<Terminal[]>>(url, {
        cacheTTL: 1800000, // 30 минут
        retries: 2
      });

      if (response.success) {
        return response.data.filter(terminal => terminal.is_active);
      } else {
        logger.warn('API returned unsuccessful response for terminals', response);
        return [];
      }
    } catch (error) {
      logger.error('Failed to fetch terminals', error);
      return [];
    }
  }

  /**
   * Получение категорий с кэшированием
   */
  async getCategories(parentId?: number): Promise<Category[]> {
    try {
      const url = parentId ? `categories?parent_id=${parentId}` : 'categories/root';
      
      const response = await apiService.get<ApiResponse<Category[]>>(url, {
        cacheTTL: 1800000, // 30 минут
        retries: 2
      });

      if (response.success) {
        return response.data.filter(category => category.is_active);
      } else {
        logger.warn('API returned unsuccessful response for categories', response);
        return [];
      }
    } catch (error) {
      logger.error('Failed to fetch categories', error);
      return [];
    }
  }

  /**
   * Получение продуктов по категории с пагинацией
   */
  async getProductsByCategory(
    categoryId: number, 
    page: number = 1, 
    limit: number = 20
  ): Promise<{ products: Product[]; pagination: any }> {
    try {
      const response = await apiService.getPaginated<Product>(
        `category/${categoryId}/products`,
        { page, limit },
        {
          cacheTTL: 600000, // 10 минут для продуктов
          retries: 2
        }
      );

      return {
        products: response.data.filter(product => product.is_active),
        pagination: response.pagination
      };
    } catch (error) {
      logger.error('Failed to fetch products by category', error);
      return { products: [], pagination: { page: 1, limit, total: 0, totalPages: 0, hasNext: false, hasPrev: false } };
    }
  }

  /**
   * Поиск продуктов с пагинацией
   */
  async searchProducts(
    query: string, 
    page: number = 1, 
    limit: number = 20
  ): Promise<{ products: Product[]; pagination: any }> {
    try {
      const response = await apiService.getPaginated<Product>(
        'products/search',
        { page, limit },
        {
          params: { q: query },
          cacheTTL: 300000, // 5 минут для поиска
          retries: 2
        }
      );

      return {
        products: response.data.filter(product => product.is_active),
        pagination: response.pagination
      };
    } catch (error) {
      logger.error('Failed to search products', error);
      return { products: [], pagination: { page: 1, limit, total: 0, totalPages: 0, hasNext: false, hasPrev: false } };
    }
  }

  /**
   * Получение популярных продуктов
   */
  async getPopularProducts(limit: number = 10): Promise<Product[]> {
    try {
      const response = await apiService.get<ApiResponse<Product[]>>('products/popular', {
        params: { limit },
        cacheTTL: 900000, // 15 минут
        retries: 2
      });

      if (response.success) {
        return response.data.filter(product => product.is_active);
      } else {
        logger.warn('API returned unsuccessful response for popular products', response);
        return [];
      }
    } catch (error) {
      logger.error('Failed to fetch popular products', error);
      return [];
    }
  }

  /**
   * Получение деталей продукта
   */
  async getProductDetails(productId: number): Promise<Product | null> {
    try {
      const response = await apiService.get<ApiResponse<Product>>(`products/${productId}`, {
        cacheTTL: 600000, // 10 минут
        retries: 2
      });

      if (response.success && response.data.is_active) {
        return response.data;
      } else {
        logger.warn('Product not found or inactive', { productId });
        return null;
      }
    } catch (error) {
      logger.error('Failed to fetch product details', error);
      return null;
    }
  }

  /**
   * Пакетное получение продуктов
   */
  async getBatchProducts(productIds: number[]): Promise<Product[]> {
    try {
      // Разбиваем на чанки по 20 продуктов
      const chunks = this.chunkArray(productIds, 20);
      const requests = chunks.map(chunk => ({
        url: 'products/batch',
        options: {
          method: 'POST' as const,
          data: { ids: chunk },
          cacheTTL: 600000,
          retries: 2
        }
      }));

      const responses = await apiService.batchRequests<ApiResponse<Product[]>>(requests);
      
      const allProducts: Product[] = [];
      for (const response of responses) {
        if (response && response.success) {
          allProducts.push(...response.data.filter(product => product.is_active));
        }
      }

      return allProducts;
    } catch (error) {
      logger.error('Failed to fetch batch products', error);
      return [];
    }
  }

  /**
   * Неблокирующее обновление кэша
   */
  async preloadData(): Promise<void> {
    logger.info('Starting data preload...');
    
    // Запускаем все запросы параллельно, не ждем результата
    const preloadPromises = [
      this.getCities(),
      this.getTerminals(),
      this.getCategories(),
      this.getPopularProducts()
    ];

    // Запускаем в фоне
    Promise.allSettled(preloadPromises).then(results => {
      const successful = results.filter(r => r.status === 'fulfilled').length;
      logger.info(`Data preload completed: ${successful}/${results.length} successful`);
    }).catch(error => {
      logger.error('Data preload failed', error);
    });
  }

  /**
   * Инвалидация кэша при обновлении данных
   */
  invalidateCache(type: 'cities' | 'terminals' | 'categories' | 'products' | 'all'): void {
    switch (type) {
      case 'cities':
        apiService.invalidateCache('cities');
        break;
      case 'terminals':
        apiService.invalidateCache('terminals');
        break;
      case 'categories':
        apiService.invalidateCache('categories');
        break;
      case 'products':
        apiService.invalidateCache('products');
        apiService.invalidateCache('category');
        break;
      case 'all':
        apiService.invalidateCache();
        break;
    }
    
    logger.info(`Cache invalidated: ${type}`);
  }

  /**
   * Получение статистики производительности
   */
  getPerformanceStats() {
    return apiService.getStats();
  }

  /**
   * Утилита для разбивки массива на чанки
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Получение адреса по координатам (оптимизированная версия)
   */
  async getAddressByCoordinates(
    latitude: number, 
    longitude: number, 
    language: string = 'ru'
  ): Promise<string> {
    try {
      const cacheKey = `address_${latitude}_${longitude}_${language}`;
      
      // Используем внешний API через наш сервис
      const response = await apiService.get<any>('https://nominatim.openstreetmap.org/reverse', {
        params: {
          format: 'json',
          lat: latitude,
          lon: longitude,
          'accept-language': language === 'uz' ? 'uz,ru' : language,
          addressdetails: 1,
          zoom: 18,
          namedetails: 1
        },
        headers: {
          'User-Agent': 'TelegramBot/2.0'
        },
        cacheTTL: 86400000, // 24 часа для адресов
        retries: 2,
        timeout: 5000
      });

      if (response && response.display_name) {
        return this.formatAddress(response, language);
      } else {
        return this.getDefaultAddressMessage(language);
      }
    } catch (error) {
      logger.error('Failed to get address by coordinates', error);
      return this.getDefaultAddressMessage(language);
    }
  }

  /**
   * Форматирование адреса
   */
  private formatAddress(addressData: any, language: string): string {
    if (addressData.address) {
      const address = addressData.address;
      const formattedParts = [];
      
      if (language === 'ru' || language === 'uz') {
        if (address.country) formattedParts.push(address.country);
        if (address.city) formattedParts.push(address.city);
        if (address.road) formattedParts.push(address.road);
        if (address.house_number) formattedParts.push(address.house_number);
      } else {
        if (address.house_number) formattedParts.push(address.house_number);
        if (address.road) formattedParts.push(address.road);
        if (address.city) formattedParts.push(address.city);
        if (address.country) formattedParts.push(address.country);
      }
      
      if (formattedParts.length > 0) {
        return formattedParts.join(', ');
      }
    }
    
    return addressData.display_name || this.getDefaultAddressMessage(language);
  }

  /**
   * Сообщение по умолчанию для адреса
   */
  private getDefaultAddressMessage(language: string): string {
    switch (language) {
      case 'ru': return "Адрес не определен";
      case 'en': return "Address not determined";
      case 'uz': return "Manzil aniqlanmadi";
      default: return "Address not determined";
    }
  }
}

// Создаем единственный экземпляр
export const optimizedApiHelpers = OptimizedApiHelpers.getInstance(); 