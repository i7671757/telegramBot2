import { Scenes, Markup } from 'telegraf';
import type { AuthContext } from '../middlewares/auth';
const { match } = require("telegraf-i18n");

export const changeNameScene = new Scenes.BaseScene<AuthContext>('changeName');


changeNameScene.command('start', async (ctx) => {
  // Leave the current scene to return to the global context
  await ctx.scene.leave();
  
  // Now pass control to the global /start command handler
  // This will trigger the global handler which resets the session
  await ctx.reply(ctx.i18n.t('bot_restarted') || 'Bot has been restarted. Starting from the beginning...');
  
  // Go to language selection scene (now called start scene)
  return ctx.scene.enter('start');
});

// Добавляем обработчик команды /settings
changeNameScene.command('settings', async (ctx) => {
  console.log('ChangeName scene: /settings command received');
  
  // Выходим из текущей сцены
  await ctx.scene.leave();
  
  // Переходим в сцену настроек
  return ctx.scene.enter('settings');
});

changeNameScene.command('order', async (ctx) => {
  await ctx.scene.enter('newOrder');
});

changeNameScene.command('feedback', async (ctx) => {
  await ctx.scene.enter('callback');
});

changeNameScene.enter(async (ctx) => {
  const keyboard = Markup.keyboard([
    [ctx.i18n.t('changeName.back')]
  ]).resize();

  await ctx.reply(ctx.i18n.t('changeName.enter_name'), keyboard);
});

// Handle back button
changeNameScene.hears(match('changeName.back'), async (ctx) => {
  await ctx.scene.enter('mainMenu');
});

// Handle text input
changeNameScene.on('text', async (ctx) => {
  const newName = ctx.message.text;
  
  // Ignore if it's the back button text
  if (newName.startsWith('⬅️')) return;

  // Save the new name in session
  if (!ctx.session) {
    ctx.session = {
      language: 'en',
      registered: false,
      phone: null,
      currentCity: null,
      selectedCity: null
    };
  }
  ctx.session.userName = newName;

  // Confirm the change
  await ctx.reply(ctx.i18n.t('changeName.success', { name: newName }));
  
  // Return to the menu
  await ctx.scene.enter('mainMenu');
}); 