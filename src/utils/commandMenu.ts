import { Markup } from 'telegraf';
import { Context } from 'telegraf';
import type { BotCommandScope } from 'telegraf/types';

/**
 * Функция для создания меню команд
 * @returns {object} Кнопочная клавиатура Telegram с командами
 */
export const createCommandMenu = () => {
  return Markup.keyboard([
    ['/start'],
    ['/order'],
    ['/settings'],
    ['/feedback']
  ]).resize();
};

/**
 * Отправляет кнопки меню команд пользователю
 * @param {object} ctx Контекст Telegraf
 * @param {string} message Сообщение для отображения с кнопками
 */
export const sendCommandMenu = async (ctx: any, message: string = 'Выберите команду:') => {
  const keyboard = createCommandMenu();
  return await ctx.reply(message, keyboard);
};

/**
 * Устанавливает команды в системное меню Telegram с учетом локализации
 * @param {object} bot Экземпляр бота Telegraf
 * @param {object} ctx Контекст Telegraf с i18n
 * @param {boolean} forUser Установить команды только для конкретного пользователя
 */
export const setLocalizedCommands = async (bot: any, ctx: any, forUser: boolean = true) => {
  try {
    // Получаем текущий язык
    const locale = ctx.i18n.locale();
    
    // Локализованные команды
    let commands = [];
    
    if (locale === 'ru') {
      commands = [
        { command: 'start', description: 'Запустить бота' },
        { command: 'order', description: 'Сделать заказ' },
        { command: 'settings', description: 'Настройки' },
        { command: 'feedback', description: 'Обратная связь' },
        // { command: 'categories', description: 'Просмотр категорий товаров' }
      ];
    } else if (locale === 'uz') {
      commands = [
        { command: 'start', description: 'Botni ishga tushirish' },
        { command: 'order', description: 'Buyurtma berish' },
        { command: 'settings', description: 'Sozlamalar' },
        { command: 'feedback', description: 'Fikr-mulohaza' },
        // { command: 'categories', description: 'Mahsulot toifalarini ko\'rish' }
      ];
    } else {
      // По умолчанию - английский
      commands = [
        { command: 'start', description: 'Start the bot' },
        { command: 'order', description: 'Place an order' },
        { command: 'settings', description: 'Settings' },
        { command: 'feedback', description: 'Send feedback' },
        // { command: 'categories', description: 'Browse product categories' }
      ];
    }
    
    // Проверяем доступность методов для установки команд
    if (bot.telegram && typeof bot.telegram.setMyCommands === 'function') {
      try {
        // Устанавливаем команды стандартным способом
        if (forUser && ctx.from && ctx.from.id) {
          await bot.telegram.setMyCommands(commands, {
            scope: { type: 'chat', chat_id: ctx.from.id }
          });
          console.log(`Localized bot commands have been set for user ${ctx.from.id} in ${locale} language`);
        } else {
          await bot.telegram.setMyCommands(commands, {
            scope: { type: 'default' }
          });
          console.log(`Global localized bot commands have been set in ${locale} language`);
        }
      } catch (cmdError) {
        console.error('Error setting commands via telegram.setMyCommands:', cmdError);
      }
    } else if (bot.api && typeof bot.api.setMyCommands === 'function') {
      try {
        // Альтернативный способ для более новых версий API
        if (forUser && ctx.from && ctx.from.id) {
          await bot.api.setMyCommands(commands, {
            scope: { type: 'chat', chat_id: ctx.from.id }
          });
          console.log(`Localized bot commands have been set for user ${ctx.from.id} in ${locale} language`);
        } else {
          await bot.api.setMyCommands(commands, {
            scope: { type: 'default' }
          });
          console.log(`Global localized bot commands have been set in ${locale} language`);
        }
      } catch (apiError) {
        console.error('Error setting commands via api.setMyCommands:', apiError);
      }
    } else {
      // Если методов нет, просто логируем это и идем дальше
      console.log(`Warning: Bot command setting methods not available. Commands not set for ${locale} language.`);
      console.log('This will not affect core bot functionality.');
    }
  } catch (error) {
    console.error('Error setting localized bot commands:', error);
    // Мы не будем пробрасывать ошибку дальше, чтобы не прерывать работу бота
  }
};

/**
 * Регистрирует глобальные обработчики команд в боте
 * @param {object} bot Экземпляр бота Telegraf
 */
export const registerGlobalCommandHandlers = (bot: any) => {
  // Обработчик команды /start, который работает в любой сцене
  bot.command('start', async (ctx: any) => {
    console.log('Global handler: /start command received');
    try {
      // Полностью сбрасываем сессию
      ctx.session = { 
        __scenes: {
          current: null,
          state: {}
        },
        language: ctx.i18n.locale() || 'en',
        registered: false,
        phone: null,
        currentCity: null,
        cities: []
      };
      
      // Выходим из всех сцен (если в какой-то находимся)
      if (ctx.scene) {
        await ctx.scene.leave();
      }
      
      // Отправляем сообщение о перезапуске
      await ctx.reply(ctx.i18n.t('bot_restarted') || 'Bot has been restarted. Starting from the beginning...');
      
      // Всегда начинаем с выбора языка
      return ctx.scene.enter('start');
    } catch (error) {
      console.error('Error during bot restart:', error);
      await ctx.reply('An error occurred while restarting the bot. Please try again.');
    }
  });

  // Глобальный обработчик команды /language
  bot.command('language', (ctx: any) => {
    console.log('Global handler: /language command received');
    return ctx.scene.enter('start');
  });

  // Глобальный обработчик команды /register
  bot.command('register', (ctx: any) => {
    console.log('Global handler: /register command received');
    return ctx.scene.enter('register');
  });

  // Глобальный обработчик команды /help
  bot.command('help', (ctx: any) => {
    console.log('Global handler: /help command received');
    ctx.reply(ctx.i18n.t('help'));
  });

  // Глобальный обработчик команды /order
  bot.command('order', async (ctx: any) => {
    console.log('Global handler: /order command received');
    // Проверяем, зарегистрирован ли пользователь
    if (!ctx.session.registered) {
      await ctx.reply(ctx.i18n.t('registration_required'));
      return ctx.scene.enter('register');
    }
    
    // Если зарегистрирован, переходим к сцене заказа
    await ctx.reply(ctx.i18n.t('order_flow_placeholder'));
    return ctx.scene.enter('newOrder');
  });

  // Глобальный обработчик команды /settings
  bot.command('settings', async (ctx: any) => {
    console.log('Global handler: /settings command received');
    return ctx.scene.enter('settings');
  });

  // Глобальный обработчик команды /feedback
  bot.command('feedback', async (ctx: any) => {
    console.log('Global handler: /feedback command received');
    return ctx.scene.enter('callback');
  });

  // Глобальный обработчик команды /categories
  // bot.command('categories', async (ctx: any) => {
  //   console.log('Global handler: /categories command received');
  //   return ctx.scene.enter('categories');
  // });

  console.log('Global command handlers have been registered');
}; 