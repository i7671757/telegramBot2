import { logger } from './logger';
import type { AuthContext } from '../middlewares/auth';

export interface ErrorMetrics {
  totalErrors: number;
  errorsByType: Record<string, number>;
  errorsByScene: Record<string, number>;
  lastErrors: Array<{
    timestamp: string;
    type: string;
    message: string;
    userId?: number;
    scene?: string;
  }>;
}

class ErrorHandler {
  private metrics: ErrorMetrics = {
    totalErrors: 0,
    errorsByType: {},
    errorsByScene: {},
    lastErrors: []
  };

  private adminChatId?: number;

  constructor(adminChatId?: number) {
    this.adminChatId = adminChatId;
  }

  /**
   * Обработка ошибок в сценах бота
   */
  async handleBotError(error: any, ctx: AuthContext, scene?: string) {
    const errorType = error.constructor.name || 'UnknownError';
    const userId = ctx.from?.id;
    const username = ctx.from?.username || ctx.from?.first_name;

    // Логирование
    logger.error('Bot error occurred', error, {
      userId,
      username,
      scene,
      updateType: ctx.updateType
    });

    // Обновление метрик
    this.updateMetrics(errorType, scene, userId);

    // Уведомление пользователя
    await this.notifyUser(ctx, error);

    // Уведомление администратора (если критическая ошибка)
    if (this.isCriticalError(error)) {
      await this.notifyAdmin(error, ctx, scene);
    }
  }

  /**
   * Обработка ошибок API
   */
  async handleApiError(error: any, endpoint: string, method: string = 'GET') {
    logger.error(`API error: ${method} ${endpoint}`, error);
    
    this.updateMetrics('ApiError', `API:${endpoint}`);
  }

  /**
   * Обработка ошибок базы данных
   */
  async handleDatabaseError(error: any, operation: string) {
    logger.error(`Database error: ${operation}`, error);
    
    this.updateMetrics('DatabaseError', `DB:${operation}`);
  }

  private updateMetrics(errorType: string, scene?: string, userId?: number) {
    this.metrics.totalErrors++;
    
    // По типу ошибки
    this.metrics.errorsByType[errorType] = (this.metrics.errorsByType[errorType] || 0) + 1;
    
    // По сцене
    if (scene) {
      this.metrics.errorsByScene[scene] = (this.metrics.errorsByScene[scene] || 0) + 1;
    }

    // Последние ошибки (храним только 50)
    this.metrics.lastErrors.unshift({
      timestamp: new Date().toISOString(),
      type: errorType,
      message: errorType,
      userId,
      scene
    });

    if (this.metrics.lastErrors.length > 50) {
      this.metrics.lastErrors = this.metrics.lastErrors.slice(0, 50);
    }
  }

  private async notifyUser(ctx: AuthContext, error: any) {
    try {
      // Определяем тип ошибки и отправляем соответствующее сообщение
      if (error.message?.includes('session')) {
        await ctx.reply(ctx.i18n.t('error_occurred') || 'Произошла ошибка сессии. Попробуйте перезапустить бота командой /start');
      } else if (error.message?.includes('not registered')) {
        await ctx.reply(ctx.i18n.t('registration_required') || 'Необходима регистрация');
      } else if (error.code === 400) {
        await ctx.reply(ctx.i18n.t('error_occurred') || 'Произошла ошибка. Попробуйте позже.');
      } else {
        await ctx.reply(ctx.i18n.t('error_occurred') || 'Произошла неожиданная ошибка. Наша команда уже работает над исправлением.');
      }
    } catch (notificationError) {
      logger.error('Failed to notify user about error', notificationError);
    }
  }

  private async notifyAdmin(error: any, ctx: AuthContext, scene?: string) {
    if (!this.adminChatId) return;

    try {
      const message = `🚨 *Критическая ошибка в боте*\n\n` +
        `*Пользователь:* ${ctx.from?.id} (@${ctx.from?.username || 'unknown'})\n` +
        `*Сцена:* ${scene || 'unknown'}\n` +
        `*Ошибка:* \`${error.message}\`\n` +
        `*Время:* ${new Date().toLocaleString('ru-RU')}`;

      // Здесь нужно будет добавить отправку сообщения админу
      // ctx.telegram.sendMessage(this.adminChatId, message, { parse_mode: 'Markdown' });
      
      logger.info('Admin notification sent', { adminChatId: this.adminChatId, error: error.message });
    } catch (adminNotificationError) {
      logger.error('Failed to notify admin', adminNotificationError);
    }
  }

  private isCriticalError(error: any): boolean {
    const criticalErrors = [
      'DatabaseError',
      'AuthenticationError',
      'PaymentError',
      'OrderProcessingError'
    ];

    return criticalErrors.some(criticalError => 
      error.constructor.name.includes(criticalError) || 
      error.message?.includes(criticalError.toLowerCase())
    );
  }

  /**
   * Получение метрик для мониторинга
   */
  getMetrics(): ErrorMetrics {
    return { ...this.metrics };
  }

  /**
   * Сброс метрик (для периодической очистки)
   */
  resetMetrics() {
    this.metrics = {
      totalErrors: 0,
      errorsByType: {},
      errorsByScene: {},
      lastErrors: []
    };
  }

  /**
   * Middleware для автоматической обработки ошибок
   */
  middleware() {
    return async (ctx: AuthContext, next: () => Promise<void>) => {
      try {
        await next();
      } catch (error) {
        await this.handleBotError(error, ctx, ctx.scene?.current?.id);
      }
    };
  }
}

// Экспортируем единственный экземпляр
export const errorHandler = new ErrorHandler(
  process.env.ADMIN_CHAT_ID ? parseInt(process.env.ADMIN_CHAT_ID) : undefined
); 