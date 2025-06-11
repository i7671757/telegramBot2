import { Context, type MiddlewareFn, Scenes } from 'telegraf';
import { checkUserExists } from '../utils/auth';

export interface AuthSession {
  language: string;
  registered: boolean;
  phone: string | null;
  currentCity: any;
  selectedCity: any;
  user?: any;
  authToken?: string;
  isAuthenticated?: boolean;
  otpToken?: string;
  otpRetries?: number;
  lastOtpSent?: number;
  otp?: string;
  __scenes?: any;
  cart?: {
    items: Array<{ id: number; name: string; price: number; quantity: number }>;
    total: number;
    updatedAt?: string;
    createdAt?: string;
  };
  previousScene?: string;
  selectedCategory?: any;
  cities?: any[];
  userName?: string;
  products?: any;
  productQuantities?: Record<string, number>;
  selectedProduct?: any;
  ratings?: {
    product: number;
    service: number;
    delivery: number;
  };
  address?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  selectedBranch?: number | string | null;
  terminals?: any[];
  expectingTimeSlotSelection?: boolean;
  expectingTimeInput?: boolean;
  expectingAdditionalPhone?: boolean;
  additionalPhone?: string;
  expectingCutleryChoice?: boolean;
  includeCutlery?: boolean;
  expectingOrderConfirmation?: boolean;
  lastViewedOrder?: string;
  // Поле для отслеживания изменений сессии
  _isDirty?: boolean;
}

export interface AuthContext extends Context {
  session: AuthSession;
  scene: Scenes.SceneContextScene<AuthContext>;
  i18n: {
    t: (key: string, params?: any) => string;
    locale: (lang?: string) => string;
  };
}

/**
 * Middleware для проверки авторизации пользователя
 * Если пользователь не авторизован, перенаправляет на сцену авторизации
 */
export function requireAuth(): MiddlewareFn<AuthContext> {
  return async (ctx, next) => {
    // Инициализируем сессию если она не существует
    if (!ctx.session) {
      ctx.session = {
        language: 'ru',
        registered: false,
        phone: null,
        currentCity: null,
        selectedCity: null,
        isAuthenticated: false,
        otpRetries: 0
      };
    }

    // Проверяем, авторизован ли пользователь в сессии
    if (ctx.session.isAuthenticated && ctx.session.user && ctx.session.authToken) {
      return next();
    }

    // Проверяем существование пользователя через API
    try {
      const userExists = await checkUserExists(ctx.from);
      
      if (userExists) {
        // Пользователь существует, но не авторизован в сессии
        // Можно либо запросить повторную авторизацию, либо считать авторизованным
        ctx.session.isAuthenticated = true;
        return next();
      } else {
        // Пользователь не существует, перенаправляем на авторизацию
        return ctx.scene.enter('user_sign');
      }
    } catch (error) {
      console.error('Error in auth middleware:', error);
      // В случае ошибки API, перенаправляем на авторизацию
      return ctx.scene.enter('user_sign');
    }
  };
}

/**
 * Middleware для инициализации сессии
 */
export function initSession(): MiddlewareFn<AuthContext> {
  return (ctx, next) => {
    if (!ctx.session) {
      ctx.session = {
        language: ctx.from?.language_code || 'ru',
        registered: false,
        phone: null,
        currentCity: null,
        selectedCity: null,
        isAuthenticated: false,
        otpRetries: 0
      };
    }
    return next();
  };
}

/**
 * Middleware для логирования действий пользователей
 */
export function logUserActions(): MiddlewareFn<AuthContext> {
  return (ctx, next) => {
    const userId = ctx.from?.id;
    const username = ctx.from?.username;
    const updateType = ctx.updateType;
    
    console.log(`[${new Date().toISOString()}] User ${userId} (${username}) - ${updateType}`);
    
    return next();
  };
}

/**
 * Проверка лимита попыток OTP
 */
export function checkOtpRetries(): MiddlewareFn<AuthContext> {
  return (ctx, next) => {
    if (!ctx.session) {
      ctx.session = {
        language: 'ru',
        registered: false,
        phone: null,
        currentCity: null,
        selectedCity: null,
        isAuthenticated: false,
        otpRetries: 0
      };
    }

    const maxRetries = 3;
    const retryWindow = 300000; // 5 минут в миллисекундах
    const now = Date.now();

    // Сбрасываем счетчик если прошло больше 5 минут
    if (ctx.session.lastOtpSent && (now - ctx.session.lastOtpSent) > retryWindow) {
      ctx.session.otpRetries = 0;
    }

    if (ctx.session.otpRetries && ctx.session.otpRetries >= maxRetries) {
      const timeLeft = Math.ceil((retryWindow - (now - (ctx.session.lastOtpSent || 0))) / 1000 / 60);
      if (ctx.i18n && ctx.i18n.t) {
        ctx.reply(ctx.i18n.t('otp_limit_exceeded', { minutes: timeLeft }));
      } else {
        ctx.reply(`Превышен лимит попыток. Попробуйте через ${timeLeft} минут.`);
      }
      return;
    }

    return next();
  };
} 