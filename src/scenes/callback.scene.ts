import { Markup, Scenes } from "telegraf";
import type { AuthContext } from '../middlewares/auth';
import TelegrafI18n from 'telegraf-i18n';
const { match } = require("telegraf-i18n");



export const callbackScene = new Scenes.BaseScene<AuthContext>('callback');

callbackScene.enter(async (ctx) => {
  console.log('Entering callback scene');
//   await ctx.reply(ctx.i18n.t('feedback.text'));   

    const keyboard = Markup.keyboard([
        [ctx.i18n.t('feedback.writeUs'), ctx.i18n.t('feedback.review')],
        [ctx.i18n.t('feedback.back')]
    ]).resize();

    await ctx.replyWithHTML(
        ctx.i18n.t('feedback.text'),
         keyboard);
});


callbackScene.hears(match('feedback.writeUs'), async (ctx) => {
    await ctx.reply(ctx.i18n.t('feedback.writeUsText'),
    Markup.inlineKeyboard([
        [Markup.button.url(ctx.i18n.t('goTo'), 'https://t.me/lesaileshelpbot')]
      ]));

});

callbackScene.hears(match('feedback.review'), async (ctx) => {
    // Enter the review scene
    await ctx.scene.enter('review');
});

callbackScene.hears(match('feedback.back'), async (ctx) => {
    await ctx.scene.enter('mainMenu');
});

callbackScene.command('feedback', async (ctx) => {
  console.log('Feedback command received in callback scene, reloading the scene');
  await ctx.scene.reenter(); // Reenter the same scene to reset it
});

// Add a start command handler
callbackScene.command('start', async (ctx) => {
  console.log('Callback scene: /start command received, restarting bot');
  
  // Exit the current scene
  await ctx.scene.leave();
  
  // Send a restart message
  await ctx.reply(ctx.i18n.t('bot_restarted') || 'Bot has been restarted. Starting from the beginning...');
  
  // Go to the start scene (formerly language scene)
  return ctx.scene.enter('start');
}); 