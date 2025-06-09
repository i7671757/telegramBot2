import { logger } from './logger';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  sanitized?: string;
}

export class InputValidator {
  
  /**
   * Валидация номера телефона
   */
  static validatePhone(phone: string): ValidationResult {
    // Удаляем все пробелы и специальные символы кроме +
    const cleaned = phone.replace(/[^\d+]/g, '');
    
    // Проверяем узбекский формат
    const uzbekPattern = /^\+998\d{9}$/;
    
    if (!uzbekPattern.test(cleaned)) {
      return {
        isValid: false,
        error: 'Неверный формат номера. Используйте формат: +998XXXXXXXXX'
      };
    }

    return {
      isValid: true,
      sanitized: cleaned
    };
  }

  /**
   * Валидация имени пользователя
   */
  static validateName(name: string): ValidationResult {
    const trimmed = name.trim();
    
    if (trimmed.length < 2) {
      return {
        isValid: false,
        error: 'Имя должно содержать минимум 2 символа'
      };
    }

    if (trimmed.length > 50) {
      return {
        isValid: false,
        error: 'Имя не должно превышать 50 символов'
      };
    }

    // Проверяем на недопустимые символы
    const namePattern = /^[a-zA-Zа-яА-ЯёЁўўқҚғҒҳҲ\s\-']+$/;
    if (!namePattern.test(trimmed)) {
      return {
        isValid: false,
        error: 'Имя может содержать только буквы, пробелы, дефисы и апострофы'
      };
    }

    return {
      isValid: true,
      sanitized: trimmed
    };
  }

  /**
   * Валидация OTP кода
   */
  static validateOTP(otp: string): ValidationResult {
    const cleaned = otp.replace(/\D/g, '');
    
    if (cleaned.length !== 6) {
      return {
        isValid: false,
        error: 'OTP код должен содержать 6 цифр'
      };
    }

    return {
      isValid: true,
      sanitized: cleaned
    };
  }

  /**
   * Валидация количества товара
   */
  static validateQuantity(quantity: string | number): ValidationResult {
    const num = typeof quantity === 'string' ? parseInt(quantity) : quantity;
    
    if (isNaN(num)) {
      return {
        isValid: false,
        error: 'Количество должно быть числом'
      };
    }

    if (num < 1) {
      return {
        isValid: false,
        error: 'Количество должно быть больше 0'
      };
    }

    if (num > 20) {
      return {
        isValid: false,
        error: 'Максимальное количество: 20'
      };
    }

    return {
      isValid: true,
      sanitized: num.toString()
    };
  }

  /**
   * Валидация текстового сообщения
   */
  static validateMessage(message: string): ValidationResult {
    const trimmed = message.trim();
    
    if (trimmed.length === 0) {
      return {
        isValid: false,
        error: 'Сообщение не может быть пустым'
      };
    }

    if (trimmed.length > 1000) {
      return {
        isValid: false,
        error: 'Сообщение не должно превышать 1000 символов'
      };
    }

    // Проверяем на спам-паттерны
    const spamPatterns = [
      /(.)\1{10,}/, // Повторяющиеся символы
      /https?:\/\/[^\s]+/gi, // URL-ы
      /\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/, // Номера карт
    ];

    for (const pattern of spamPatterns) {
      if (pattern.test(trimmed)) {
        return {
          isValid: false,
          error: 'Сообщение содержит недопустимый контент'
        };
      }
    }

    return {
      isValid: true,
      sanitized: trimmed
    };
  }

  /**
   * Валидация адреса
   */
  static validateAddress(address: string): ValidationResult {
    const trimmed = address.trim();
    
    if (trimmed.length < 10) {
      return {
        isValid: false,
        error: 'Адрес должен содержать минимум 10 символов'
      };
    }

    if (trimmed.length > 200) {
      return {
        isValid: false,
        error: 'Адрес не должен превышать 200 символов'
      };
    }

    return {
      isValid: true,
      sanitized: trimmed
    };
  }

  /**
   * Санитизация HTML
   */
  static sanitizeHtml(input: string): string {
    return input
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  /**
   * Проверка на SQL инъекции
   */
  static checkSqlInjection(input: string): boolean {
    const sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
      /(--|\/\*|\*\/|;)/,
      /(\b(OR|AND)\b.*=.*)/i
    ];

    return sqlPatterns.some(pattern => pattern.test(input));
  }

  /**
   * Валидация координат
   */
  static validateCoordinates(lat: number, lon: number): ValidationResult {
    if (isNaN(lat) || isNaN(lon)) {
      return {
        isValid: false,
        error: 'Неверные координаты'
      };
    }

    if (lat < -90 || lat > 90) {
      return {
        isValid: false,
        error: 'Широта должна быть между -90 и 90'
      };
    }

    if (lon < -180 || lon > 180) {
      return {
        isValid: false,
        error: 'Долгота должна быть между -180 и 180'
      };
    }

    return {
      isValid: true
    };
  }

  /**
   * Общая валидация с логированием
   */
  static validate(
    input: string, 
    type: 'phone' | 'name' | 'otp' | 'message' | 'address',
    userId?: number
  ): ValidationResult {
    let result: ValidationResult;

    switch (type) {
      case 'phone':
        result = this.validatePhone(input);
        break;
      case 'name':
        result = this.validateName(input);
        break;
      case 'otp':
        result = this.validateOTP(input);
        break;
      case 'message':
        result = this.validateMessage(input);
        break;
      case 'address':
        result = this.validateAddress(input);
        break;
      default:
        result = { isValid: false, error: 'Неизвестный тип валидации' };
    }

    // Логируем неудачные валидации
    if (!result.isValid) {
      logger.warn(`Validation failed: ${type}`, {
        userId,
        error: result.error,
        inputLength: input.length
      });
    }

    return result;
  }
}

/**
 * Middleware для валидации входящих сообщений
 */
export function validationMiddleware() {
  return async (ctx: any, next: () => Promise<void>) => {
    if (ctx.message?.text) {
      const text = ctx.message.text;
      
      // Проверяем на SQL инъекции
      if (InputValidator.checkSqlInjection(text)) {
        logger.warn('SQL injection attempt detected', {
          userId: ctx.from?.id,
          text: text.substring(0, 100)
        });
        await ctx.reply('Недопустимый ввод. Попробуйте еще раз.');
        return;
      }

      // Проверяем длину сообщения
      if (text.length > 1000) {
        await ctx.reply('Сообщение слишком длинное. Максимум 1000 символов.');
        return;
      }
    }

    await next();
  };
} 