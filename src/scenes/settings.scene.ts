import { Scenes, Markup } from 'telegraf';
import TelegrafI18n from 'telegraf-i18n';
import { registerSceneCommandHandlers, shouldSkipCommand } from '../utils/commandMenu';
import type { AuthContext } from '../middlewares/auth';
const { match } = require("telegraf-i18n");

// Создаем сцену настроек
export const settingsScene = new Scenes.BaseScene<AuthContext>('settings');

// Регистрируем глобальные обработчики команд для этой сцены
registerSceneCommandHandlers(settingsScene, 'Settings');

// При входе в сцену показываем клавиатуру с опциями настроек
settingsScene.enter(async (ctx) => {
  console.log('Entering settings scene');
  
  // Добавляем четкое сообщение, что мы вошли в меню настроек
  await ctx.reply(ctx.i18n.t('settings.title') || 'Вы вошли в меню настроек');
  
  const keyboard = Markup.keyboard([
    [ctx.i18n.t('menu.change_name'), ctx.i18n.t('menu.change_number')],
    [ctx.i18n.t('menu.change_city'), ctx.i18n.t('menu.change_language')],
    [ctx.i18n.t('menu.branch_info'), ctx.i18n.t('menu.public_offer')],
    [ctx.i18n.t('menu.back')]
  ]).resize();

  console.log('Sending menu.title message with keyboard');
  await ctx.reply(ctx.i18n.t('menu.title'), keyboard);
});

// Добавляем обработчик команды /start для перезапуска бота
settingsScene.command('start', async (ctx) => {
  console.log('Settings scene: /start command received, restarting bot');
  
  // Выходим из текущей сцены
  await ctx.scene.leave();
  
  // Отправляем сообщение о перезапуске
  await ctx.reply(ctx.i18n.t('bot_restarted') || 'Bot has been restarted. Starting from the beginning...');
  
  // Переходим в сцену выбора языка (now called start scene)
  return ctx.scene.enter('start');
});

// Добавляем обработчик команды /settings для обновления текущей сцены
settingsScene.command('settings', async (ctx) => {
  console.log('Settings scene: /settings command received, refreshing scene');
  
  // Так как мы уже находимся в сцене настроек, просто обновляем её
  return ctx.scene.reenter();
});

settingsScene.command('order', async (ctx) => {
  await ctx.scene.enter('newOrder');
});

settingsScene.command('feedback', async (ctx) => {
  await ctx.scene.enter('callback');
});

// Обрабатываем кнопку "назад" из меню выбора языка
settingsScene.hears(match('back'), async (ctx) => {
  // Возвращаемся в меню настроек
  await ctx.scene.reenter();
});

// Обрабатываем все текстовые сообщения
settingsScene.on('text', async (ctx) => {
  const text = ctx.message.text;

  // Пропускаем команды - они должны обрабатываться обработчиками команд сцены
  if (shouldSkipCommand(text, 'Settings')) {
    return;
  }

  // Обрабатываем каждую кнопку на основе переведенного текста
  if (text === ctx.i18n.t('menu.change_name')) {
    await ctx.scene.enter('changeName');
  } 
  else if (text === ctx.i18n.t('menu.change_number')) {
    await ctx.scene.enter('changeNumber');
  }
  else if (text === ctx.i18n.t('menu.change_city')) {
    await ctx.scene.enter('changeCity');
  }
  else if (text === ctx.i18n.t('menu.change_language')) {
    // Показываем клавиатуру выбора языка
    const keyboard = Markup.keyboard([
      [
        ctx.i18n.t('changeLanguage.languages.ru'),
        ctx.i18n.t('changeLanguage.languages.uz'),
        ctx.i18n.t('changeLanguage.languages.en')
      ],
      [ctx.i18n.t('back')]
    ]).resize();
    
    await ctx.reply(ctx.i18n.t('changeLanguage.select_language'), keyboard);
  }
  else if (text === ctx.i18n.t('menu.branch_info')) {
    await ctx.scene.enter('branchInfo');
  }
  else if (text === ctx.i18n.t('menu.public_offer')) {
    ctx.replyWithHTML("https://telegra.ph/Publichnaya-oferta-Chopar-Pizza-05-21");
  }
  else if (text === ctx.i18n.t('menu.back')) {
    await ctx.scene.enter('mainMenu');
  }
  // Обрабатываем выбор языка
  else if (text.match(/🇷🇺.*Русский/)) {
    if (!ctx.session) ctx.session = {
      language: 'en',
      registered: false,
      phone: null,
      currentCity: null,
      selectedCity: null
    };
    ctx.session.language = 'ru';
    ctx.i18n.locale('ru');
    await ctx.reply(ctx.i18n.t('changeLanguage.success'));
    // Возвращаемся в меню с обновленным языком
    await ctx.scene.reenter();
  }
  else if (text.match(/🇺🇿.*O'zbekcha/)) {
    if (!ctx.session) ctx.session = {
      language: 'en',
      registered: false,
      phone: null,
      currentCity: null,
      selectedCity: null
    };
    ctx.session.language = 'uz';
    ctx.i18n.locale('uz');
    await ctx.reply(ctx.i18n.t('changeLanguage.success'));
    // Возвращаемся в меню с обновленным языком
    await ctx.scene.reenter();
  }
  else if (text.match(/🇬🇧.*English/)) {
    if (!ctx.session) ctx.session = {
      language: 'en',
      registered: false,
      phone: null,
      currentCity: null,
      selectedCity: null
    };
    ctx.session.language = 'en';
    ctx.i18n.locale('en');
    await ctx.reply(ctx.i18n.t('changeLanguage.success'));
    // Возвращаемся в меню с обновленным языком
    await ctx.scene.reenter();
  }
}); 