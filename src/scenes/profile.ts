import { Scenes } from 'telegraf';
import { Markup } from 'telegraf';

// Define a simple context type to avoid compatibility issues
type MyContext = any;

export const profileScene = new Scenes.BaseScene<MyContext>('profile');

// On scene enter
profileScene.enter(async (ctx) => {
  const userId = ctx.from?.id;
  const userName = ctx.from?.first_name || 'Unknown';
  
  // Prepare the keyboard
  const keyboard = Markup.keyboard([
    [ctx.i18n.t('back_to_main')]
  ]).resize();
  
  // Send profile information
  await ctx.reply(ctx.i18n.t('profile_message'));
  await ctx.reply(ctx.i18n.t('profile_id', { id: userId }));
  await ctx.reply(ctx.i18n.t('profile_name', { name: userName }), keyboard);
});

// Handle back to main button
profileScene.hears(/.*back_to_main.*/, async (ctx) => {
  await ctx.scene.enter('welcome');
});

// Handle any other text
profileScene.on('text', async (ctx) => {
  await ctx.scene.enter('welcome');
}); 