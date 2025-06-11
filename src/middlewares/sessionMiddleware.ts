import { sessionService, type UserSession } from '../services/SessionService';
import type { AuthContext } from './auth';

/**
 * Middleware для автоматического управления сессиями через SessionService
 */
export function sessionMiddleware() {
  return async (ctx: AuthContext, next: () => Promise<void>) => {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;

    if (!userId || !chatId) {
      console.warn('Missing userId or chatId in session middleware');
      return next();
    }

    try {
      // Получаем сессию через SessionService
      const sessionData = await sessionService.getSession(userId, chatId);
      
      // Создаем proxy для автоматического сохранения изменений
      ctx.session = createSessionProxy(sessionData, userId, chatId);
      
      console.log(`Session loaded for user ${userId}:${chatId}`);
      
      await next();
      
      // После обработки сохраняем сессию если были изменения
      if (ctx.session && ctx.session._isDirty) {
        const { _isDirty, ...cleanSession } = ctx.session;
        await sessionService.saveSession(userId, chatId, cleanSession as UserSession);
        console.log(`Session saved for user ${userId}:${chatId}`);
      }
      
    } catch (error) {
      console.error('Session middleware error:', error);
      
      // В случае ошибки создаем временную сессию
      ctx.session = {
        language: 'en',
        registered: false,
        phone: null,
        currentCity: null,
        selectedCity: null,
        isAuthenticated: false,
        otpRetries: 0
      };
      
      await next();
    }
  };
}

/**
 * Создает proxy для сессии, который отслеживает изменения
 */
function createSessionProxy(session: UserSession, userId: number, chatId: number): UserSession & { _isDirty?: boolean } {
  let isDirty = false;
  
  const handler: ProxyHandler<UserSession & { _isDirty?: boolean }> = {
    set(target, property, value) {
      if (property !== '_isDirty') {
        isDirty = true;
        target._isDirty = true;
      }
      (target as any)[property] = value;
      return true;
    },
    
    get(target, property) {
      if (property === '_isDirty') {
        return isDirty;
      }
      return (target as any)[property];
    }
  };
  
  return new Proxy({ ...session, _isDirty: false }, handler);
}

/**
 * Утилиты для работы с сессиями
 */
export class SessionUtils {
  /**
   * Безопасное обновление сессии
   */
  static async updateSession(ctx: AuthContext, updates: Partial<UserSession>): Promise<void> {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;

    if (!userId || !chatId) {
      throw new Error('Missing userId or chatId');
    }

    try {
      const updatedSession = await sessionService.updateSession(userId, chatId, updates);
      
      // Обновляем текущую сессию в контексте
      Object.assign(ctx.session, updatedSession);
      
      console.log(`Session updated for user ${userId}:${chatId}`, updates);
    } catch (error) {
      console.error('Error updating session:', error);
      throw error;
    }
  }

  /**
   * Сброс сессии к значениям по умолчанию
   */
  static async resetSession(ctx: AuthContext): Promise<void> {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;

    if (!userId || !chatId) {
      throw new Error('Missing userId or chatId');
    }

    const defaultSession: UserSession = {
      language: ctx.session?.language || 'en',
      registered: false,
      phone: null,
      currentCity: null,
      selectedCity: null,
      isAuthenticated: false,
      otpRetries: 0
    };

    await sessionService.saveSession(userId, chatId, defaultSession);
    Object.assign(ctx.session, defaultSession);
    
    console.log(`Session reset for user ${userId}:${chatId}`);
  }

  /**
   * Проверка валидности сессии
   */
  static validateCurrentSession(ctx: AuthContext): { isValid: boolean; errors: string[] } {
    if (!ctx.session) {
      return { isValid: false, errors: ['Session not found'] };
    }

    const errors: string[] = [];

    if (!ctx.session.language) {
      errors.push('Missing language');
    }

    if (typeof ctx.session.registered !== 'boolean') {
      errors.push('Invalid registered field');
    }

    if (ctx.session.registered && !ctx.session.phone) {
      errors.push('Registered user must have phone');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Получить статистику сессий
   */
  static async getSessionStats() {
    return await sessionService.getSessionStats();
  }

  /**
   * Очистить устаревшие сессии
   */
  static async cleanupOldSessions(maxAgeInDays: number = 30): Promise<number> {
    const maxAge = maxAgeInDays * 24 * 60 * 60 * 1000;
    return await sessionService.cleanupSessions(maxAge);
  }
}

/**
 * Middleware для валидации сессии
 */
export function validateSessionMiddleware() {
  return async (ctx: AuthContext, next: () => Promise<void>) => {
    const validation = SessionUtils.validateCurrentSession(ctx);
    
    if (!validation.isValid) {
      console.warn(`Invalid session for user ${ctx.from?.id}:`, validation.errors);
      
      // Попытаться восстановить сессию
      try {
        await SessionUtils.resetSession(ctx);
        console.log(`Session restored for user ${ctx.from?.id}`);
      } catch (error) {
        console.error('Failed to restore session:', error);
        await ctx.reply('Произошла ошибка сессии. Пожалуйста, перезапустите бота командой /start');
        return;
      }
    }
    
    await next();
  };
} 