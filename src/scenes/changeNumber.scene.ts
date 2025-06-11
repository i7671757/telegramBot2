import { Scenes, Markup } from 'telegraf';
import type { AuthContext } from '../middlewares/auth';
const { match } = require("telegraf-i18n");

export const changeNumberScene = new Scenes.BaseScene<AuthContext>('changeNumber');

// Добавляем обработчик команды /settings
changeNumberScene.command('settings', async (ctx) => {
  console.log('ChangeNumber scene: /settings command received');
  
  // Выходим из текущей сцены
  await ctx.scene.leave();
  
  // Переходим в сцену настроек
  return ctx.scene.enter('settings');
});

changeNumberScene.command('order', async (ctx) => {
  await ctx.scene.enter('newOrder');
});

changeNumberScene.command('feedback', async (ctx) => {
  await ctx.scene.enter('callback');
});

changeNumberScene.enter(async (ctx) => {
  const keyboard = Markup.keyboard([
    [ctx.i18n.t('changeNumber.back'), ctx.i18n.t('changeNumber.my_number')]
  ]).resize();

  await ctx.reply(ctx.i18n.t('changeNumber.enter_number'), keyboard);
});

// Handle back button
changeNumberScene.hears(match('changeNumber.back'), async (ctx) => {
  await ctx.scene.enter('settings');
});

// Handle "My number" button
changeNumberScene.hears(/📱.+/, async (ctx) => {
  // Get the current phone number from session
  const currentPhone = ctx.session?.phone || ctx.i18n.t('not_specified');
  await ctx.reply(ctx.i18n.t('changeNumber.current_number', { phone: currentPhone }));
});

// Handle contact sharing
changeNumberScene.on('contact', async (ctx) => {
  const contact = ctx.message.contact;
  const phone = contact.phone_number;
  
  // Save the new phone number in session
  if (!ctx.session) {
    ctx.session = {
      language: 'en',
      registered: false,
      phone: null,
      currentCity: null,
      selectedCity: null
    };
  }
  ctx.session.phone = phone;

  // Confirm the change
  await ctx.reply(ctx.i18n.t('changeNumber.success', { phone }));
  
  // Return to the settings menu
  await ctx.scene.enter('settings');
});

// Handle text input (manual phone number entry)
changeNumberScene.on('text', async (ctx) => {
  const newPhone = ctx.message.text;
  
  // Ignore if it's one of the button texts
  if (newPhone.startsWith('⬅️') || newPhone.startsWith('📱')) return;

  // Validate phone number format
  const phoneRegex = /^\+998 \d{2} \d{3} \d{4}$/;
  if (!phoneRegex.test(newPhone)) {
    await ctx.reply(ctx.i18n.t('changeNumber.invalid_format'));
    return;
  }

  // Save the new phone number in session
  if (!ctx.session) {
    ctx.session = {
      language: 'en',
      registered: false,
      phone: null,
      currentCity: null,
      selectedCity: null
    };
  }
  ctx.session.phone = newPhone;

  // Confirm the change
  await ctx.reply(ctx.i18n.t('changeNumber.success', { phone: newPhone }));
  
  // Return to the settings menu
  await ctx.scene.enter('settings');
}); 