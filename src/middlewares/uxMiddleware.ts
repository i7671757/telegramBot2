import { Composer } from 'telegraf';
import { navigationManager } from '../services/NavigationManager';
import { feedbackManager } from '../services/FeedbackManager';
import { logger } from '../utils/logger';
import type { AuthContext } from './auth';

interface UXMiddlewareOptions {
  enableNavigation?: boolean;
  enableFeedback?: boolean;
  enableBreadcrumbs?: boolean;
  enableLoadingIndicators?: boolean;
  enableErrorHandling?: boolean;
  autoHideNotifications?: boolean;
  notificationDuration?: number;
}

/**
 * Middleware для улучшения пользовательского опыта
 */
export function createUXMiddleware(options: UXMiddlewareOptions = {}) {
  const {
    enableNavigation = true,
    enableFeedback = true,
    enableBreadcrumbs = true,
    enableLoadingIndicators = true,
    enableErrorHandling = true,
    autoHideNotifications = true,
    notificationDuration = 3000
  } = options;

  const composer = new Composer<AuthContext>();

  // Обработка навигационных команд
  if (enableNavigation) {
    // Обработка кнопки "Назад"
    composer.hears(/^(← Назад|⬅️ Назад|Назад|Back|Orqaga)$/i, async (ctx, next) => {
      logger.debug(`UX Middleware: Back button pressed by user ${ctx.from?.id}`);
      
      const handled = await navigationManager.handleBackButton(ctx);
      if (!handled) {
        // Если навигация не обработана, передаем дальше
        return next();
      }
    });

    // Обработка кнопки "Главная"
    composer.hears(/^(🏠 Главная|🏠 Home|Главная|Home|Bosh sahifa)$/i, async (ctx) => {
      logger.debug(`UX Middleware: Home button pressed by user ${ctx.from?.id}`);
      await ctx.scene.enter('mainMenu');
    });

    // Обработка inline навигации
    composer.action(/^nav_/, async (ctx) => {
      const action = ctx.match[0];
      logger.debug(`UX Middleware: Inline navigation ${action} by user ${ctx.from?.id}`);
      
      await ctx.answerCbQuery();
      await navigationManager.handleInlineNavigation(ctx, action);
    });

    // Обработка breadcrumb навигации
    composer.action(/^nav_to_/, async (ctx) => {
      const action = ctx.match[0];
      logger.debug(`UX Middleware: Breadcrumb navigation ${action} by user ${ctx.from?.id}`);
      
      await ctx.answerCbQuery();
      await navigationManager.handleBreadcrumbNavigation(ctx, action);
    });
  }

  // Обработка подтверждений
  if (enableFeedback) {
    composer.action(/^confirm_(yes|no)$/, async (ctx) => {
      const action = ctx.match[1];
      await ctx.answerCbQuery();
      
      if (action === 'yes') {
        await feedbackManager.showSuccess(ctx, 'Подтверждено');
      } else {
        await feedbackManager.showInfo(ctx, 'Отменено');
      }
    });
  }

  // Обработка ошибок будет добавлена на уровне бота
  // composer не имеет метода catch, используем обработку на уровне приложения

  return composer;
}

/**
 * Middleware для автоматического показа breadcrumbs при входе в сцену
 */
export function createBreadcrumbMiddleware() {
  return async (ctx: AuthContext, next: () => Promise<void>) => {
    // Сохраняем оригинальный метод enter
    const originalEnter = ctx.scene.enter.bind(ctx.scene);
    
    // Переопределяем метод enter для автоматического показа breadcrumbs
    ctx.scene.enter = async (sceneId: string, initialState?: any, silent?: boolean) => {
      const result = await originalEnter(sceneId, initialState, silent);
      
      // Показываем breadcrumbs если не в тихом режиме
      if (!silent) {
        const breadcrumbs = navigationManager.getBreadcrumbs(ctx, sceneId);
        if (breadcrumbs) {
          try {
            await ctx.reply(breadcrumbs, { parse_mode: 'HTML' });
          } catch (error) {
            logger.error('Error showing breadcrumbs', error);
          }
        }
      }
      
      return result;
    };

    return next();
  };
}

/**
 * Middleware для автоматических индикаторов загрузки
 */
export function createLoadingMiddleware(options: {
  showForApiCalls?: boolean;
  showForSceneTransitions?: boolean;
  minimumDuration?: number;
} = {}) {
  const {
    showForApiCalls = true,
    showForSceneTransitions = false,
    minimumDuration = 500
  } = options;

  return async (ctx: AuthContext, next: () => Promise<void>) => {
    const startTime = Date.now();
    let loadingShown = false;

    // Показываем загрузку для длительных операций
    const loadingTimeout = setTimeout(async () => {
      if (showForApiCalls || showForSceneTransitions) {
        await feedbackManager.showLoading(ctx);
        loadingShown = true;
      }
    }, minimumDuration);

    try {
      await next();
    } finally {
      clearTimeout(loadingTimeout);
      
      if (loadingShown) {
        const duration = Date.now() - startTime;
        const successMessage = duration > 2000 ? 'Готово!' : undefined;
        await feedbackManager.hideLoading(ctx, successMessage);
      }
    }
  };
}

/**
 * Middleware для валидации пользовательского ввода
 */
export function createValidationMiddleware() {
  return async (ctx: AuthContext, next: () => Promise<void>) => {
    // Добавляем методы валидации в контекст
    (ctx as any).validateInput = {
      phone: (phone: string) => {
        const phoneRegex = /^\+?[1-9]\d{1,14}$/;
        if (!phoneRegex.test(phone)) {
          feedbackManager.showValidationError(ctx, 'phone', 'Введите корректный номер телефона');
          return false;
        }
        return true;
      },
      
      email: (email: string) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          feedbackManager.showValidationError(ctx, 'email', 'Введите корректный email адрес');
          return false;
        }
        return true;
      },
      
      name: (name: string) => {
        if (!name || name.trim().length < 2) {
          feedbackManager.showValidationError(ctx, 'name', 'Имя должно содержать минимум 2 символа');
          return false;
        }
        if (name.length > 50) {
          feedbackManager.showValidationError(ctx, 'name', 'Имя не должно превышать 50 символов');
          return false;
        }
        return true;
      },
      
      required: (value: any, fieldName: string) => {
        if (!value || (typeof value === 'string' && value.trim() === '')) {
          feedbackManager.showValidationError(ctx, fieldName, `Поле "${fieldName}" обязательно для заполнения`);
          return false;
        }
        return true;
      }
    };

    return next();
  };
}

/**
 * Middleware для отслеживания активности пользователя
 */
export function createActivityMiddleware() {
  const userActivity = new Map<string, number>();

  return async (ctx: AuthContext, next: () => Promise<void>) => {
    const userId = ctx.from?.id?.toString();
    if (!userId) return next();

    const now = Date.now();
    const lastActivity = userActivity.get(userId) || 0;
    const timeSinceLastActivity = now - lastActivity;

    // Если пользователь был неактивен более 30 минут
    if (timeSinceLastActivity > 30 * 60 * 1000 && lastActivity > 0) {
      await feedbackManager.showInfo(
        ctx,
        'Добро пожаловать обратно!',
        'Вы можете продолжить с того места, где остановились'
      );
    }

    userActivity.set(userId, now);
    return next();
  };
}

/**
 * Middleware для контекстной помощи
 */
export function createHelpMiddleware() {
  return async (ctx: AuthContext, next: () => Promise<void>) => {
    // Добавляем метод показа помощи в контекст
    (ctx as any).showHelp = async (helpText?: string) => {
      const currentScene = (ctx.session as any)?.currentScene;
      const sceneConfig = navigationManager.getSceneConfig(currentScene);
      
      let message = helpText;
      if (!message) {
        switch (currentScene) {
          case 'categories':
            message = 'Выберите категорию товаров из списка ниже';
            break;
          case 'products':
            message = 'Выберите товар и добавьте его в корзину';
            break;
          case 'checkout':
            message = 'Проверьте ваш заказ и подтвердите оформление';
            break;
          case 'settings':
            message = 'Здесь вы можете изменить свои настройки';
            break;
          default:
            message = 'Используйте кнопки меню для навигации';
        }
      }

      await feedbackManager.showInfo(ctx, 'Помощь', message);
    };

    // Обработка команды помощи
    if (ctx.message && 'text' in ctx.message) {
      const text = ctx.message.text.toLowerCase();
      if (text === '/help' || text === 'помощь' || text === 'help') {
        await (ctx as any).showHelp();
        return;
      }
    }

    return next();
  };
}

/**
 * Основной UX middleware с полной функциональностью
 */
export const uxMiddleware = createUXMiddleware({
  enableNavigation: true,
  enableFeedback: true,
  enableBreadcrumbs: true,
  enableLoadingIndicators: true,
  enableErrorHandling: true,
  autoHideNotifications: true,
  notificationDuration: 3000
});

/**
 * Легкий UX middleware только с навигацией
 */
export const lightUXMiddleware = createUXMiddleware({
  enableNavigation: true,
  enableFeedback: false,
  enableBreadcrumbs: false,
  enableLoadingIndicators: false,
  enableErrorHandling: true
});

/**
 * Middleware для сцен с полной поддержкой UX
 */
export const sceneUXMiddleware = Composer.compose([
  createBreadcrumbMiddleware(),
  createLoadingMiddleware(),
  createValidationMiddleware(),
  createActivityMiddleware(),
  createHelpMiddleware(),
  uxMiddleware
]); 