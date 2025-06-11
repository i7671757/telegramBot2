import type { AuthContext } from './auth';

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitized?: string;
  risk: 'low' | 'medium' | 'high';
}

export class InputValidator {
  private static instance: InputValidator;
  
  // Паттерны для обнаружения вредоносного контента
  private readonly maliciousPatterns = [
    // SQL Injection
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/gi,
    /(\b(OR|AND)\s+\d+\s*=\s*\d+)/gi,
    /(--|\/\*|\*\/|;)/g,
    
    // XSS patterns
    /<script[^>]*>.*?<\/script>/gi,
    /<iframe[^>]*>.*?<\/iframe>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    
    // Command injection
    /(\||&|;|`|\$\(|\${)/g,
    /(rm\s+-rf|wget|curl|nc\s+)/gi,
    
    // Path traversal
    /(\.\.[\/\\]){2,}/g,
    /(\/etc\/passwd|\/etc\/shadow|\/proc\/)/gi
  ];

  // Подозрительные символы
  private readonly suspiciousChars = [
    '\x00', '\x01', '\x02', '\x03', '\x04', '\x05', '\x06', '\x07',
    '\x08', '\x0B', '\x0C', '\x0E', '\x0F', '\x10', '\x11', '\x12',
    '\x13', '\x14', '\x15', '\x16', '\x17', '\x18', '\x19', '\x1A',
    '\x1B', '\x1C', '\x1D', '\x1E', '\x1F', '\x7F'
  ];

  private constructor() {}

  static getInstance(): InputValidator {
    if (!InputValidator.instance) {
      InputValidator.instance = new InputValidator();
    }
    return InputValidator.instance;
  }

  /**
   * Основная функция валидации
   */
  validate(input: string, maxLength: number = 4096): ValidationResult {
    const errors: string[] = [];
    let risk: 'low' | 'medium' | 'high' = 'low';
    let sanitized = input;

    // Проверка на null/undefined
    if (!input || typeof input !== 'string') {
      return { isValid: false, errors: ['Input is required'], risk: 'high' };
    }

    // Проверка длины
    if (input.length > maxLength) {
      errors.push(`Input too long (max ${maxLength} characters)`);
      risk = 'medium';
    }

    // Проверка на подозрительные символы
    const hasSuspiciousChars = this.suspiciousChars.some(char => input.includes(char));
    if (hasSuspiciousChars) {
      errors.push('Contains suspicious control characters');
      risk = 'high';
      sanitized = this.removeSuspiciousChars(sanitized);
    }

    // Проверка на вредоносные паттерны
    const maliciousCheck = this.checkMaliciousPatterns(input);
    if (maliciousCheck.found) {
      errors.push('Potentially malicious content detected');
      risk = 'high';
    }

    // Проверка на спам (повторяющиеся символы)
    const spamCheck = this.checkSpam(input);
    if (spamCheck.isSpam) {
      errors.push('Spam detected');
      risk = 'medium';
    }

    const isValid = risk !== 'high';

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
  validatePhone(phone: string): boolean {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
    return phoneRegex.test(cleanPhone);
  }

  /**
   * Валидация callback data
   */
  validateCallback(data: string): boolean {
    const callbackRegex = /^[a-zA-Z0-9_]+(:[\w\-\.]+)?$/;
    return callbackRegex.test(data) && data.length <= 64;
  }

  /**
   * Проверка на вредоносные паттерны
   */
  private checkMaliciousPatterns(input: string): { found: boolean } {
    return {
      found: this.maliciousPatterns.some(pattern => pattern.test(input))
    };
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
   * Проверка на спам
   */
  private checkSpam(input: string): { isSpam: boolean } {
    const charCounts = new Map<string, number>();
    
    for (const char of input) {
      charCounts.set(char, (charCounts.get(char) || 0) + 1);
    }

    let maxRepeats = 0;
    for (const count of charCounts.values()) {
      maxRepeats = Math.max(maxRepeats, count);
    }

    const ratio = maxRepeats / input.length;
    return { isSpam: ratio > 0.5 && maxRepeats > 10 };
  }
}

// Создаем единственный экземпляр
export const inputValidator = InputValidator.getInstance();

/**
 * Middleware для валидации входных данных
 */
export function inputValidationMiddleware() {
  return async (ctx: AuthContext, next: () => Promise<void>) => {
    const userId = ctx.from?.id;
    
    // Валидируем текстовые сообщения
    if (ctx.message && 'text' in ctx.message && ctx.message.text) {
      const validation = inputValidator.validate(ctx.message.text);

      if (!validation.isValid) {
        console.warn(`Invalid input from user ${userId}:`, validation.errors);
        
        if (validation.risk === 'high') {
          await ctx.reply('🚫 Обнаружен потенциально опасный контент.');
          return;
        }
        
        if (validation.risk === 'medium') {
          await ctx.reply('⚠️ Ваше сообщение содержит недопустимые символы.');
        }
      }

      // Заменяем текст на очищенный
      if (validation.sanitized) {
        (ctx.message as any).text = validation.sanitized;
      }
    }

    // Валидируем callback data
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery && ctx.callbackQuery.data) {
      if (!inputValidator.validateCallback(ctx.callbackQuery.data)) {
        console.warn(`Invalid callback data from user ${userId}`);
        await ctx.answerCbQuery('❌ Недопустимые данные');
        return;
      }
    }

    // Валидируем контакты
    if (ctx.message && 'contact' in ctx.message && ctx.message.contact) {
      if (!inputValidator.validatePhone(ctx.message.contact.phone_number)) {
        await ctx.reply('❌ Недопустимый формат номера телефона');
        return;
      }
    }

    await next();
  };
} 