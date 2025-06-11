import { logger } from '../utils/logger';
import type { AuthContext } from '../middlewares/auth';

interface LoadingState {
  isLoading: boolean;
  message?: string;
  startTime: number;
  messageId?: number;
}

interface ErrorMessage {
  type: 'error' | 'warning' | 'info' | 'success';
  title: string;
  description?: string;
  action?: string;
  icon?: string;
}

interface ProgressState {
  current: number;
  total: number;
  message: string;
  messageId?: number;
}

export class FeedbackManager {
  private static instance: FeedbackManager;
  private loadingStates: Map<string, LoadingState> = new Map();
  private progressStates: Map<string, ProgressState> = new Map();

  private constructor() {}

  static getInstance(): FeedbackManager {
    if (!FeedbackManager.instance) {
      FeedbackManager.instance = new FeedbackManager();
    }
    return FeedbackManager.instance;
  }

  /**
   * Получение ключа пользователя
   */
  private getUserKey(ctx: AuthContext): string {
    return `${ctx.from?.id || 'unknown'}:${ctx.chat?.id || 'unknown'}`;
  }

  /**
   * Показать индикатор загрузки
   */
  async showLoading(ctx: AuthContext, message?: string): Promise<void> {
    const userKey = this.getUserKey(ctx);
    const loadingMessage = message || ctx.i18n.t('feedback.loading') || '⏳ Загрузка...';

    try {
      const sentMessage = await ctx.reply(loadingMessage);
      
      this.loadingStates.set(userKey, {
        isLoading: true,
        message: loadingMessage,
        startTime: Date.now(),
        messageId: sentMessage.message_id
      });

      logger.debug(`Loading indicator shown for user ${ctx.from?.id}`, {
        message: loadingMessage
      });
    } catch (error) {
      logger.error('Error showing loading indicator', error);
    }
  }

  /**
   * Скрыть индикатор загрузки
   */
  async hideLoading(ctx: AuthContext, successMessage?: string): Promise<void> {
    const userKey = this.getUserKey(ctx);
    const loadingState = this.loadingStates.get(userKey);

    if (!loadingState || !loadingState.isLoading) {
      return;
    }

    try {
      // Удаляем сообщение о загрузке
      if (loadingState.messageId) {
        try {
          await ctx.deleteMessage(loadingState.messageId);
        } catch (error) {
          // Игнорируем ошибки удаления (сообщение может быть уже удалено)
        }
      }

      // Показываем сообщение об успехе если указано
      if (successMessage) {
        await ctx.reply(successMessage);
      }

      const duration = Date.now() - loadingState.startTime;
      logger.debug(`Loading indicator hidden for user ${ctx.from?.id}`, {
        duration: `${duration}ms`
      });

      this.loadingStates.delete(userKey);
    } catch (error) {
      logger.error('Error hiding loading indicator', error);
    }
  }

  /**
   * Показать сообщение об ошибке
   */
  async showError(ctx: AuthContext, error: ErrorMessage | string): Promise<void> {
    let errorMessage: ErrorMessage;

    if (typeof error === 'string') {
      errorMessage = {
        type: 'error',
        title: error,
        icon: '❌'
      };
    } else {
      errorMessage = error;
    }

    // Скрываем загрузку если активна
    await this.hideLoading(ctx);

    const icon = errorMessage.icon || this.getIconForType(errorMessage.type);
    let messageText = `${icon} <b>${errorMessage.title}</b>`;

    if (errorMessage.description) {
      messageText += `\n\n${errorMessage.description}`;
    }

    if (errorMessage.action) {
      messageText += `\n\n💡 <i>${errorMessage.action}</i>`;
    }

    try {
      await ctx.reply(messageText, { parse_mode: 'HTML' });
      
      logger.info(`Error message shown to user ${ctx.from?.id}`, {
        type: errorMessage.type,
        title: errorMessage.title
      });
    } catch (error) {
      logger.error('Error showing error message', error);
    }
  }

  /**
   * Показать сообщение об успехе
   */
  async showSuccess(ctx: AuthContext, message: string, description?: string): Promise<void> {
    await this.hideLoading(ctx);

    const icon = '✅';
    let messageText = `${icon} <b>${message}</b>`;

    if (description) {
      messageText += `\n\n${description}`;
    }

    try {
      await ctx.reply(messageText, { parse_mode: 'HTML' });
      
      logger.info(`Success message shown to user ${ctx.from?.id}`, {
        message
      });
    } catch (error) {
      logger.error('Error showing success message', error);
    }
  }

  /**
   * Показать предупреждение
   */
  async showWarning(ctx: AuthContext, message: string, description?: string): Promise<void> {
    const icon = '⚠️';
    let messageText = `${icon} <b>${message}</b>`;

    if (description) {
      messageText += `\n\n${description}`;
    }

    try {
      await ctx.reply(messageText, { parse_mode: 'HTML' });
      
      logger.info(`Warning message shown to user ${ctx.from?.id}`, {
        message
      });
    } catch (error) {
      logger.error('Error showing warning message', error);
    }
  }

  /**
   * Показать информационное сообщение
   */
  async showInfo(ctx: AuthContext, message: string, description?: string): Promise<void> {
    const icon = 'ℹ️';
    let messageText = `${icon} <b>${message}</b>`;

    if (description) {
      messageText += `\n\n${description}`;
    }

    try {
      await ctx.reply(messageText, { parse_mode: 'HTML' });
      
      logger.info(`Info message shown to user ${ctx.from?.id}`, {
        message
      });
    } catch (error) {
      logger.error('Error showing info message', error);
    }
  }

  /**
   * Показать прогресс
   */
  async showProgress(ctx: AuthContext, current: number, total: number, message: string): Promise<void> {
    const userKey = this.getUserKey(ctx);
    const percentage = Math.round((current / total) * 100);
    const progressBar = this.createProgressBar(percentage);
    
    const progressMessage = `${progressBar} ${percentage}%\n${message}`;

    try {
      const existingProgress = this.progressStates.get(userKey);
      
      if (existingProgress && existingProgress.messageId) {
        // Обновляем существующее сообщение
        try {
          await ctx.telegram.editMessageText(
            ctx.chat?.id,
            existingProgress.messageId,
            undefined,
            progressMessage
          );
        } catch (error) {
          // Если не удалось обновить, отправляем новое
          const sentMessage = await ctx.reply(progressMessage);
          this.progressStates.set(userKey, {
            current,
            total,
            message,
            messageId: sentMessage.message_id
          });
        }
      } else {
        // Отправляем новое сообщение
        const sentMessage = await ctx.reply(progressMessage);
        this.progressStates.set(userKey, {
          current,
          total,
          message,
          messageId: sentMessage.message_id
        });
      }

      logger.debug(`Progress shown for user ${ctx.from?.id}`, {
        current,
        total,
        percentage
      });
    } catch (error) {
      logger.error('Error showing progress', error);
    }
  }

  /**
   * Скрыть прогресс
   */
  async hideProgress(ctx: AuthContext, finalMessage?: string): Promise<void> {
    const userKey = this.getUserKey(ctx);
    const progressState = this.progressStates.get(userKey);

    if (!progressState) return;

    try {
      if (progressState.messageId) {
        if (finalMessage) {
          // Обновляем сообщение финальным текстом
          await ctx.telegram.editMessageText(
            ctx.chat?.id,
            progressState.messageId,
            undefined,
            finalMessage
          );
        } else {
          // Удаляем сообщение о прогрессе
          try {
            await ctx.deleteMessage(progressState.messageId);
          } catch (error) {
            // Игнорируем ошибки удаления
          }
        }
      }

      this.progressStates.delete(userKey);
      
      logger.debug(`Progress hidden for user ${ctx.from?.id}`);
    } catch (error) {
      logger.error('Error hiding progress', error);
    }
  }

  /**
   * Создание прогресс-бара
   */
  private createProgressBar(percentage: number): string {
    const totalBars = 10;
    const filledBars = Math.round((percentage / 100) * totalBars);
    const emptyBars = totalBars - filledBars;
    
    return '█'.repeat(filledBars) + '░'.repeat(emptyBars);
  }

  /**
   * Получение иконки для типа сообщения
   */
  private getIconForType(type: string): string {
    switch (type) {
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
      case 'success': return '✅';
      default: return 'ℹ️';
    }
  }

  /**
   * Показать типизированную ошибку API
   */
  async showApiError(ctx: AuthContext, error: any): Promise<void> {
    let errorMessage: ErrorMessage;

    if (error.response) {
      // Ошибка HTTP
      const status = error.response.status;
      const statusText = error.response.statusText;
      
      switch (status) {
        case 400:
          errorMessage = {
            type: 'error',
            title: ctx.i18n.t('errors.bad_request') || 'Неверный запрос',
            description: ctx.i18n.t('errors.check_input') || 'Проверьте введенные данные',
            action: ctx.i18n.t('errors.try_again') || 'Попробуйте еще раз'
          };
          break;
        case 401:
          errorMessage = {
            type: 'error',
            title: ctx.i18n.t('errors.unauthorized') || 'Ошибка авторизации',
            description: ctx.i18n.t('errors.login_required') || 'Необходимо войти в систему',
            action: ctx.i18n.t('errors.login_action') || 'Войдите в свой аккаунт'
          };
          break;
        case 404:
          errorMessage = {
            type: 'error',
            title: ctx.i18n.t('errors.not_found') || 'Данные не найдены',
            description: ctx.i18n.t('errors.resource_missing') || 'Запрашиваемый ресурс не существует',
            action: ctx.i18n.t('errors.check_selection') || 'Проверьте ваш выбор'
          };
          break;
        case 500:
          errorMessage = {
            type: 'error',
            title: ctx.i18n.t('errors.server_error') || 'Ошибка сервера',
            description: ctx.i18n.t('errors.temporary_issue') || 'Временные технические проблемы',
            action: ctx.i18n.t('errors.try_later') || 'Попробуйте позже'
          };
          break;
        default:
          errorMessage = {
            type: 'error',
            title: ctx.i18n.t('errors.network_error') || 'Ошибка сети',
            description: `HTTP ${status}: ${statusText}`,
            action: ctx.i18n.t('errors.check_connection') || 'Проверьте подключение к интернету'
          };
      }
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = {
        type: 'error',
        title: ctx.i18n.t('errors.timeout') || 'Превышено время ожидания',
        description: ctx.i18n.t('errors.slow_connection') || 'Медленное соединение с сервером',
        action: ctx.i18n.t('errors.try_again') || 'Попробуйте еще раз'
      };
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      errorMessage = {
        type: 'error',
        title: ctx.i18n.t('errors.connection_failed') || 'Нет соединения',
        description: ctx.i18n.t('errors.server_unavailable') || 'Сервер недоступен',
        action: ctx.i18n.t('errors.check_connection') || 'Проверьте подключение к интернету'
      };
    } else {
      errorMessage = {
        type: 'error',
        title: ctx.i18n.t('errors.unknown_error') || 'Неизвестная ошибка',
        description: error.message || ctx.i18n.t('errors.unexpected_error') || 'Произошла неожиданная ошибка',
        action: ctx.i18n.t('errors.contact_support') || 'Обратитесь в поддержку'
      };
    }

    await this.showError(ctx, errorMessage);
  }

  /**
   * Показать сообщение о валидации
   */
  async showValidationError(ctx: AuthContext, field: string, message: string): Promise<void> {
    const errorMessage: ErrorMessage = {
      type: 'warning',
      title: ctx.i18n.t('validation.invalid_input') || 'Неверные данные',
      description: message,
      action: ctx.i18n.t('validation.correct_and_retry') || 'Исправьте и попробуйте снова',
      icon: '⚠️'
    };

    await this.showError(ctx, errorMessage);
  }

  /**
   * Проверка активности загрузки
   */
  isLoading(ctx: AuthContext): boolean {
    const userKey = this.getUserKey(ctx);
    const loadingState = this.loadingStates.get(userKey);
    return loadingState?.isLoading || false;
  }

  /**
   * Очистка всех состояний пользователя
   */
  clearUserStates(ctx: AuthContext): void {
    const userKey = this.getUserKey(ctx);
    this.loadingStates.delete(userKey);
    this.progressStates.delete(userKey);
  }

  /**
   * Показать подтверждение действия
   */
  async showConfirmation(ctx: AuthContext, message: string, confirmText?: string, cancelText?: string): Promise<void> {
    const confirmButton = confirmText || ctx.i18n.t('confirmation.yes') || '✅ Да';
    const cancelButton = cancelText || ctx.i18n.t('confirmation.no') || '❌ Нет';

    const keyboard = {
      inline_keyboard: [
        [
          { text: confirmButton, callback_data: 'confirm_yes' },
          { text: cancelButton, callback_data: 'confirm_no' }
        ]
      ]
    };

    try {
      await ctx.reply(message, {
        reply_markup: keyboard,
        parse_mode: 'HTML'
      });
    } catch (error) {
      logger.error('Error showing confirmation', error);
    }
  }

  /**
   * Показать уведомление с автоскрытием
   */
  async showNotification(ctx: AuthContext, message: string, duration: number = 3000): Promise<void> {
    try {
      const sentMessage = await ctx.reply(`💬 ${message}`);
      
      // Автоматически удаляем через указанное время
      setTimeout(async () => {
        try {
          await ctx.deleteMessage(sentMessage.message_id);
        } catch (error) {
          // Игнорируем ошибки удаления
        }
      }, duration);
    } catch (error) {
      logger.error('Error showing notification', error);
    }
  }
}

// Создаем единственный экземпляр
export const feedbackManager = FeedbackManager.getInstance(); 