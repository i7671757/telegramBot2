import { Scenes, Markup } from 'telegraf';
import TelegrafI18n from 'telegraf-i18n';
import { setLocalizedCommands } from '../utils/commandMenu';

// Use any type for now to avoid complex type conflicts
type MyContext = Scenes.SceneContext & {
  i18n: TelegrafI18n;
  session: any;
};

// Create the start scene (renamed from language scene)
export const startScene = new Scenes.BaseScene<MyContext>('start');

startScene.enter((ctx) => {
  console.log('Entered start scene');
  const keyboard = Markup.keyboard([
    [ctx.i18n.t('changeLanguage.languages.en'), ctx.i18n.t('changeLanguage.languages.ru'), ctx.i18n.t('changeLanguage.languages.uz')]
  ]).resize();
  
  ctx.replyWithHTML('<b>Assalomu alaykum! Les Ailes yetkazib berish xizmatiga xush kelibsiz.\n\nЗдравствуйте! Добро пожаловать в службу доставки Les Ailes.\n\nHello! Welcome to Les Ailes delivery service.</b>', keyboard);
});

// Now setup language handlers
startScene.hears('🇬🇧 English', async (ctx) => {
  console.log('English language selected');
  ctx.i18n.locale('en');
  
  // Устанавливаем локализованные команды меню для пользователя
  try {
    // Set localized commands for user and globally
    await setLocalizedCommands(ctx.telegram, ctx, true);
    await setLocalizedCommands(ctx.telegram, ctx, false);
  } catch (error) {
    console.error('Error setting commands:', error);
  }
  
  // Явно проверяем состояние сессии
  if (!ctx.session || !ctx.session.registered) {
    console.log('User not registered, entering register scene');
    return ctx.scene.enter('register');
  }
  console.log('User registered, entering welcome scene');
  return ctx.scene.enter('welcome');
});

startScene.hears('🇷🇺 Русский', async (ctx) => {
  console.log('Russian language selected');
  ctx.i18n.locale('ru');
  
  // Устанавливаем локализованные команды меню для пользователя
  try {
    // Set localized commands for user and globally
    await setLocalizedCommands(ctx.telegram, ctx, true);
    await setLocalizedCommands(ctx.telegram, ctx, false);
  } catch (error) {
    console.error('Error setting commands:', error);
  }
  
  // Явно проверяем состояние сессии
  if (!ctx.session || !ctx.session.registered) {
    console.log('User not registered, entering register scene');
    return ctx.scene.enter('register');
  }
  console.log('User registered, entering welcome scene');
  return ctx.scene.enter('welcome');
});

startScene.hears('🇺🇿 O\'zbekcha', async (ctx) => {
  console.log('Uzbek language selected');
  ctx.i18n.locale('uz');
  
  // Устанавливаем локализованные команды меню для пользователя
  try {
    // Set localized commands for user and globally
    await setLocalizedCommands(ctx.telegram, ctx, true);
    await setLocalizedCommands(ctx.telegram, ctx, false);
  } catch (error) {
    console.error('Error setting commands:', error);
  }
  
  // Явно проверяем состояние сессии
  if (!ctx.session || !ctx.session.registered) {
    console.log('User not registered, entering register scene');
    return ctx.scene.enter('register');
  }
  console.log('User registered, entering welcome scene');
  return ctx.scene.enter('welcome');
});

// Handle language fallback
startScene.on('message', (ctx) => {
  const keyboard = Markup.keyboard([
    ['🇬🇧 English', '🇷🇺 Русский', '🇺🇿 O\'zbekcha']
  ]).resize();
  
  ctx.reply('Пожалуйста, выберите язык используя кнопки ниже / Please select your language using buttons below / Iltimos, quyidagi tugmalar yordamida tilni tanlang', keyboard);
}); 