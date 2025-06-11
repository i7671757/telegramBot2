import type { AuthContext } from './auth';
import { securityConfig } from '../config/security';

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitized?: string;
  risk: 'low' | 'medium' | 'high';
}

interface ValidationStats {
  totalValidations: number;
  blockedInputs: number;
  sanitizedInputs: number;
  riskDistribution: {
    low: number;
    medium: number;
    high: number;
  };
}

export class InputValidationService {
  private static instance: InputValidationService;
  private stats: ValidationStats = {
    totalValidations: 0,
    blockedInputs: 0,
    sanitizedInputs: 0,
    riskDistribution: { low: 0, medium: 0, high: 0 }
  };

  // Паттерны для обнаружения вредоносного контента
  private readonly maliciousPatterns = [
    // SQL Injection patterns
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/gi,
    /(\b(OR|AND)\s+\d+\s*=\s*\d+)/gi,
    /(--|\/\*|\*\/|;)/g,
    
    // XSS patterns
    /<script[^>]*>.*?<\/script>/gi,
    /<iframe[^>]*>.*?<\/iframe>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    
    // Command injection patterns
    /(\||&|;|`|\$\(|\${)/g,
    /(rm\s+-rf|wget|curl|nc\s+)/gi,
    
    // Path traversal
    /(\.\.[\/\\]){2,}/g,
    /(\/etc\/passwd|\/etc\/shadow|\/proc\/)/gi,
    
    // NoSQL injection
    /(\$where|\$ne|\$gt|\$lt|\$regex)/gi,
    
    // LDAP injection
    /(\*|\(|\)|\\|\/)/g
  ];

  // Подозрительные символы и последовательности
  private readonly suspiciousChars = [
    '\x00', '\x01', '\x02', '\x03', '\x04', '\x05', '\x06', '\x07',
    '\x08', '\x0B', '\x0C', '\x0E', '\x0F', '\x10', '\x11', '\x12',
    '\x13', '\x14', '\x15', '\x16', '\x17', '\x18', '\x19', '\x1A',
    '\x1B', '\x1C', '\x1D', '\x1E', '\x1F', '\x7F'
  ];

  // Максимальные длины для разных типов данных
  private readonly maxLengths = {
    message: 4096,
    command: 256,
    callback: 64,
    username: 32,
    phone: 20,
    address: 500,
    comment: 1000
  };

  private constructor() {}

  static getInstance(): InputValidationService {
    if (!InputValidationService.instance) {
      InputValidationService.instance = new InputValidationService();
    }
    return InputValidationService.instance;
  }

  /**
   * Основная функция валидации
   */
  validateInput(
    input: string, 
    type: keyof typeof this.maxLengths = 'message',
    options: {
      allowHtml?: boolean;
      allowSpecialChars?: boolean;
      strictMode?: boolean;
    } = {}
  ): ValidationResult {
    this.stats.totalValidations++;
    
    const errors: string[] = [];
    let risk: 'low' | 'medium' | 'high' = 'low';
    let sanitized = input;

    // 1. Проверка на null/undefined
    if (!input || typeof input !== 'string') {
      errors.push('Input is required and must be a string');
      return { isValid: false, errors, risk: 'high' };
    }

    // 2. Проверка длины
    const maxLength = this.maxLengths[type];
    if (input.length > maxLength) {
      errors.push(`Input too long (max ${maxLength} characters)`);
      risk = 'medium';
    }

    // 3. Проверка на подозрительные символы
    const suspiciousFound = this.suspiciousChars.some(char => input.includes(char));
    if (suspiciousFound) {
      errors.push('Contains suspicious control characters');
      risk = 'high';
      sanitized = this.removeSuspiciousChars(sanitized);
    }

    // 4. Проверка на вредоносные паттерны
    const maliciousCheck = this.checkMaliciousPatterns(input);
    if (maliciousCheck.found) {
      errors.push(`Potentially malicious content detected: ${maliciousCheck.type}`);
      risk = 'high';
    }

    // 5. Проверка на чрезмерное количество специальных символов
    const specialCharRatio = this.calculateSpecialCharRatio(input);
    if (specialCharRatio > 0.3 && !options.allowSpecialChars) {
      errors.push('Too many special characters');
      risk = 'medium';
    }

    // 6. Проверка на повторяющиеся символы (возможный спам)
    const repeatingCheck = this.checkRepeatingChars(input);
    if (repeatingCheck.isSpam) {
      errors.push('Detected repeating character spam');
      risk = 'medium';
    }

    // 7. HTML валидация
    if (!options.allowHtml && this.containsHtml(input)) {
      errors.push('HTML content not allowed');
      risk = 'medium';
      sanitized = this.stripHtml(sanitized);
    }

    // 8. Проверка на Unicode атаки
    const unicodeCheck = this.checkUnicodeAttacks(input);
    if (unicodeCheck.suspicious) {
      errors.push('Suspicious Unicode sequences detected');
      risk = 'high';
    }

    // Обновляем статистику
    this.stats.riskDistribution[risk]++;
    
    if (errors.length > 0) {
      this.stats.blockedInputs++;
    }
    
    if (sanitized !== input) {
      this.stats.sanitizedInputs++;
    }

    const isValid = options.strictMode ? errors.length === 0 : risk !== 'high';

    return {
      isValid,
      errors,
      sanitized: sanitized !== input ? sanitized : undefined,
      risk
    };
  }

  /**
   * Валидация телефонного номера
   */
  validatePhone(phone: string): ValidationResult {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
    
    if (!phoneRegex.test(cleanPhone)) {
      return {
        isValid: false,
        errors: ['Invalid phone number format'],
        risk: 'low'
      };
    }

    return { isValid: true, errors: [], risk: 'low' };
  }

  /**
   * Валидация email адреса
   */
  validateEmail(email: string): ValidationResult {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!emailRegex.test(email)) {
      return {
        isValid: false,
        errors: ['Invalid email format'],
        risk: 'low'
      };
    }

    return { isValid: true, errors: [], risk: 'low' };
  }

  /**
   * Валидация callback data
   */
  validateCallbackData(data: string): ValidationResult {
    // Callback data должна быть в формате action:param или просто action
    const callbackRegex = /^[a-zA-Z0-9_]+(:[\w\-\.]+)?$/;
    
    if (!callbackRegex.test(data)) {
      return {
        isValid: false,
        errors: ['Invalid callback data format'],
        risk: 'medium'
      };
    }

    return this.validateInput(data, 'callback', { strictMode: true });
  }

  /**
   * Проверка на вредоносные паттерны
   */
  private checkMaliciousPatterns(input: string): { found: boolean; type?: string } {
    for (const pattern of this.maliciousPatterns) {
      if (pattern.test(input)) {
        return { found: true, type: pattern.source };
      }
    }
    return { found: false };
  }

  /**
   * Удаление подозрительных символов
   */
  private removeSuspiciousChars(input: string): string {
    let result = input;
    for (const char of this.suspiciousChars) {
      result = result.replace(new RegExp(char, 'g'), '');
    }
    return result;
  }

  /**
   * Расчет соотношения специальных символов
   */
  private calculateSpecialCharRatio(input: string): number {
    const specialChars = input.match(/[^a-zA-Z0-9\s\u0400-\u04FF]/g) || [];
    return specialChars.length / input.length;
  }

  /**
   * Проверка на повторяющиеся символы
   */
  private checkRepeatingChars(input: string): { isSpam: boolean; ratio: number } {
    const charCounts = new Map<string, number>();
    
    for (const char of input) {
      charCounts.set(char, (charCounts.get(char) || 0) + 1);
    }

    let maxRepeats = 0;
    for (const count of charCounts.values()) {
      maxRepeats = Math.max(maxRepeats, count);
    }

    const ratio = maxRepeats / input.length;
    return { isSpam: ratio > 0.5 && maxRepeats > 10, ratio };
  }

  /**
   * Проверка на HTML контент
   */
  private containsHtml(input: string): boolean {
    return /<[^>]+>/g.test(input);
  }

  /**
   * Удаление HTML тегов
   */
  private stripHtml(input: string): string {
    return input.replace(/<[^>]+>/g, '');
  }

  /**
   * Проверка на Unicode атаки
   */
  private checkUnicodeAttacks(input: string): { suspicious: boolean; reason?: string } {
    // Проверка на Right-to-Left Override атаки
    if (input.includes('\u202E') || input.includes('\u202D')) {
      return { suspicious: true, reason: 'RTL override attack' };
    }

    // Проверка на невидимые символы
    const invisibleChars = /[\u200B-\u200D\u2060\uFEFF]/g;
    if (invisibleChars.test(input)) {
      return { suspicious: true, reason: 'Invisible characters' };
    }

    // Проверка на Homograph атаки (похожие символы)
    const homographs = /[а-я]/g; // Кириллица вместо латиницы
    const latinChars = /[a-z]/g;
    
    if (homographs.test(input) && latinChars.test(input)) {
      return { suspicious: true, reason: 'Mixed scripts (possible homograph attack)' };
    }

    return { suspicious: false };
  }

  /**
   * Получение статистики валидации
   */
  getStats(): ValidationStats {
    return { ...this.stats };
  }

  /**
   * Сброс статистики
   */
  resetStats(): void {
    this.stats = {
      totalValidations: 0,
      blockedInputs: 0,
      sanitizedInputs: 0,
      riskDistribution: { low: 0, medium: 0, high: 0 }
    };
  }
}

// Создаем единственный экземпляр
export const inputValidationService = InputValidationService.getInstance();

/**
 * Middleware для валидации входных данных
 */
export function inputValidationMiddleware() {
  return async (ctx: AuthContext, next: () => Promise<void>) => {
    const userId = ctx.from?.id;
    
    // Валидируем текстовые сообщения
    if (ctx.message && 'text' in ctx.message && ctx.message.text) {
      const validation = inputValidationService.validateInput(
        ctx.message.text,
        ctx.message.text.startsWith('/') ? 'command' : 'message'
      );

      if (!validation.isValid) {
        console.warn(`Invalid input from user ${userId}:`, validation.errors);
        
        if (validation.risk === 'high') {
          await ctx.reply('🚫 Обнаружен потенциально опасный контент. Сообщение заблокировано.');
          return;
        }
        
        if (validation.risk === 'medium') {
          await ctx.reply('⚠️ Ваше сообщение содержит недопустимые символы и было изменено.');
        }
      }

      // Заменяем оригинальный текст на очищенный, если есть
      if (validation.sanitized) {
        (ctx.message as any).text = validation.sanitized;
      }
    }

    // Валидируем callback data
    if (ctx.callbackQuery?.data) {
      const validation = inputValidationService.validateCallbackData(ctx.callbackQuery.data);
      
      if (!validation.isValid) {
        console.warn(`Invalid callback data from user ${userId}:`, validation.errors);
        await ctx.answerCbQuery('❌ Недопустимые данные');
        return;
      }
    }

    // Валидируем контактную информацию
    if (ctx.message && 'contact' in ctx.message && ctx.message.contact) {
      const phoneValidation = inputValidationService.validatePhone(
        ctx.message.contact.phone_number
      );
      
      if (!phoneValidation.isValid) {
        await ctx.reply('❌ Недопустимый формат номера телефона');
        return;
      }
    }

    // Добавляем информацию о валидации в контекст
    (ctx as any).validation = {
      service: inputValidationService
    };

    await next();
  };
}

/**
 * Утилиты для валидации
 */
export class ValidationUtils {
  /**
   * Быстрая проверка безопасности строки
   */
  static isSafe(input: string): boolean {
    const validation = inputValidationService.validateInput(input, 'message', { strictMode: true });
    return validation.isValid;
  }

  /**
   * Очистка строки от опасного контента
   */
  static sanitize(input: string): string {
    const validation = inputValidationService.validateInput(input);
    return validation.sanitized || input;
  }

  /**
   * Валидация номера телефона
   */
  static validatePhone(phone: string): boolean {
    return inputValidationService.validatePhone(phone).isValid;
  }

  /**
   * Валидация email
   */
  static validateEmail(email: string): boolean {
    return inputValidationService.validateEmail(email).isValid;
  }

  /**
   * Получение статистики валидации
   */
  static getStats(): ValidationStats {
    return inputValidationService.getStats();
  }
} 