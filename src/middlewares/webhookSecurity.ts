import crypto from 'crypto';
import { securityConfig } from '../config/security';

interface WebhookValidationResult {
  isValid: boolean;
  error?: string;
  timestamp?: number;
}

export class WebhookSecurityService {
  private static instance: WebhookSecurityService;
  private validationStats = {
    totalRequests: 0,
    validRequests: 0,
    invalidRequests: 0,
    suspiciousRequests: 0
  };

  private constructor() {}

  static getInstance(): WebhookSecurityService {
    if (!WebhookSecurityService.instance) {
      WebhookSecurityService.instance = new WebhookSecurityService();
    }
    return WebhookSecurityService.instance;
  }

  /**
   * Валидация Telegram webhook подписи
   */
  validateTelegramSignature(
    body: string,
    signature: string,
    secretToken?: string
  ): WebhookValidationResult {
    this.validationStats.totalRequests++;

    if (!securityConfig.features.webhookValidation) {
      this.validationStats.validRequests++;
      return { isValid: true };
    }

    const secret = secretToken || securityConfig.webhookSecret;
    if (!secret) {
      this.validationStats.invalidRequests++;
      return { 
        isValid: false, 
        error: 'Webhook secret not configured' 
      };
    }

    try {
      // Создаем HMAC подпись
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex');

      // Сравниваем подписи безопасным способом
      const providedSignature = signature.replace('sha256=', '');
      const isValid = crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(providedSignature, 'hex')
      );

      if (isValid) {
        this.validationStats.validRequests++;
      } else {
        this.validationStats.invalidRequests++;
        console.warn('Invalid webhook signature detected');
      }

      return { 
        isValid,
        error: isValid ? undefined : 'Invalid signature',
        timestamp: Date.now()
      };
    } catch (error) {
      this.validationStats.invalidRequests++;
      return { 
        isValid: false, 
        error: 'Signature validation failed' 
      };
    }
  }

  /**
   * Проверка IP адреса отправителя
   */
  validateSourceIP(clientIP: string): boolean {
    // Telegram IP ranges (обновляется периодически)
    const telegramIPRanges = [
      '149.154.160.0/20',
      '91.108.4.0/22',
      '91.108.56.0/22',
      '91.108.8.0/22',
      '95.161.64.0/20'
    ];

    // В development режиме разрешаем localhost
    if (securityConfig.nodeEnv === 'development') {
      const localhostIPs = ['127.0.0.1', '::1', 'localhost'];
      if (localhostIPs.includes(clientIP)) {
        return true;
      }
    }

    // Проверяем, входит ли IP в разрешенные диапазоны
    return telegramIPRanges.some(range => this.isIPInRange(clientIP, range));
  }

  /**
   * Проверка частоты запросов от одного IP
   */
  checkRequestFrequency(clientIP: string): { allowed: boolean; retryAfter?: number } {
    const key = `webhook_${clientIP}`;
    const now = Date.now();
    const windowMs = 60000; // 1 минута
    const maxRequests = 100; // максимум 100 запросов в минуту

    // Простая реализация rate limiting для webhook
    const requests = this.getIPRequests(clientIP);
    const recentRequests = requests.filter(time => now - time < windowMs);

    if (recentRequests.length >= maxRequests) {
      const oldestRequest = Math.min(...recentRequests);
      const retryAfter = Math.ceil((oldestRequest + windowMs - now) / 1000);
      
      this.validationStats.suspiciousRequests++;
      return { allowed: false, retryAfter };
    }

    // Добавляем текущий запрос
    this.addIPRequest(clientIP, now);
    return { allowed: true };
  }

  /**
   * Валидация размера тела запроса
   */
  validateRequestSize(contentLength: number): boolean {
    const maxSize = 10 * 1024 * 1024; // 10MB максимум
    return contentLength <= maxSize;
  }

  /**
   * Валидация Content-Type
   */
  validateContentType(contentType: string): boolean {
    const allowedTypes = [
      'application/json',
      'application/x-www-form-urlencoded'
    ];
    
    return allowedTypes.some(type => contentType.includes(type));
  }

  /**
   * Получение статистики валидации
   */
  getStats() {
    return { ...this.validationStats };
  }

  /**
   * Сброс статистики
   */
  resetStats(): void {
    this.validationStats = {
      totalRequests: 0,
      validRequests: 0,
      invalidRequests: 0,
      suspiciousRequests: 0
    };
  }

  /**
   * Проверка, входит ли IP в диапазон CIDR
   */
  private isIPInRange(ip: string, cidr: string): boolean {
    try {
      const [range, bits] = cidr.split('/');
      const mask = ~(2 ** (32 - parseInt(bits)) - 1);
      
      const ipNum = this.ipToNumber(ip);
      const rangeNum = this.ipToNumber(range);
      
      return (ipNum & mask) === (rangeNum & mask);
    } catch {
      return false;
    }
  }

  /**
   * Преобразование IP в число
   */
  private ipToNumber(ip: string): number {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
  }

  // Простое хранилище запросов по IP (в production лучше использовать Redis)
  private ipRequests = new Map<string, number[]>();

  private getIPRequests(ip: string): number[] {
    return this.ipRequests.get(ip) || [];
  }

  private addIPRequest(ip: string, timestamp: number): void {
    const requests = this.getIPRequests(ip);
    requests.push(timestamp);
    
    // Оставляем только последние 1000 запросов
    if (requests.length > 1000) {
      requests.splice(0, requests.length - 1000);
    }
    
    this.ipRequests.set(ip, requests);
  }
}

// Создаем единственный экземпляр
export const webhookSecurity = WebhookSecurityService.getInstance();

/**
 * Middleware для Elysia webhook безопасности
 */
export function createWebhookSecurityMiddleware() {
  return {
    beforeHandle: async ({ request, set }: any) => {
      const clientIP = request.headers.get('x-forwarded-for') || 
                      request.headers.get('x-real-ip') || 
                      'unknown';

      // 1. Проверка IP адреса
      if (!webhookSecurity.validateSourceIP(clientIP)) {
        console.warn(`Webhook request from unauthorized IP: ${clientIP}`);
        set.status = 403;
        return { error: 'Forbidden' };
      }

      // 2. Проверка частоты запросов
      const frequencyCheck = webhookSecurity.checkRequestFrequency(clientIP);
      if (!frequencyCheck.allowed) {
        console.warn(`Rate limit exceeded for IP: ${clientIP}`);
        set.status = 429;
        set.headers['Retry-After'] = frequencyCheck.retryAfter?.toString() || '60';
        return { error: 'Too Many Requests' };
      }

      // 3. Проверка размера запроса
      const contentLength = parseInt(request.headers.get('content-length') || '0');
      if (!webhookSecurity.validateRequestSize(contentLength)) {
        console.warn(`Request too large from IP: ${clientIP}, size: ${contentLength}`);
        set.status = 413;
        return { error: 'Request Entity Too Large' };
      }

      // 4. Проверка Content-Type
      const contentType = request.headers.get('content-type') || '';
      if (!webhookSecurity.validateContentType(contentType)) {
        console.warn(`Invalid content type from IP: ${clientIP}: ${contentType}`);
        set.status = 415;
        return { error: 'Unsupported Media Type' };
      }

      // 5. Валидация подписи (если включена)
      if (securityConfig.features.webhookValidation && securityConfig.webhookSecret) {
        const signature = request.headers.get('x-telegram-bot-api-secret-token') || '';
        const body = await request.text();
        
        const validation = webhookSecurity.validateTelegramSignature(body, signature);
        if (!validation.isValid) {
          console.warn(`Invalid webhook signature from IP: ${clientIP}`);
          set.status = 401;
          return { error: 'Unauthorized' };
        }
      }
    }
  };
}

/**
 * Утилиты для webhook безопасности
 */
export class WebhookSecurityUtils {
  /**
   * Генерация безопасного webhook secret
   */
  static generateWebhookSecret(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Проверка силы webhook secret
   */
  static validateSecretStrength(secret: string): { isStrong: boolean; issues: string[] } {
    const issues: string[] = [];
    
    if (secret.length < 16) {
      issues.push('Secret too short (minimum 16 characters)');
    }
    
    if (!/[A-Z]/.test(secret)) {
      issues.push('Secret should contain uppercase letters');
    }
    
    if (!/[a-z]/.test(secret)) {
      issues.push('Secret should contain lowercase letters');
    }
    
    if (!/[0-9]/.test(secret)) {
      issues.push('Secret should contain numbers');
    }
    
    if (!/[^A-Za-z0-9]/.test(secret)) {
      issues.push('Secret should contain special characters');
    }

    return {
      isStrong: issues.length === 0,
      issues
    };
  }

  /**
   * Получение статистики webhook безопасности
   */
  static getStats() {
    return webhookSecurity.getStats();
  }

  /**
   * Сброс статистики
   */
  static resetStats(): void {
    webhookSecurity.resetStats();
  }
} 