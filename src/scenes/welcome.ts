import { Scenes } from 'telegraf';
import { Markup } from 'telegraf';
import type { AuthContext } from '../middlewares/auth';

// Define a simple context type to avoid compatibility issues
type MyContext = any;

export const welcomeScene = new Scenes.BaseScene<AuthContext>('welcome');

// On scene enter
welcomeScene.enter(async (ctx) => {
  const keyboard = Markup.keyboard([
    ['/profile'],
    ['/language en', '/language ru']
  ]).resize();
  
  await ctx.reply(ctx.i18n.t('welcome'), keyboard);
});

// Handle any text in this scene
welcomeScene.on('text', async (ctx) => {
  // Just respond with welcome message again
  const keyboard = Markup.keyboard([
    ['/profile'],
    ['/language en', '/language ru']
  ]).resize();
  
  await ctx.reply(ctx.i18n.t('welcome'), keyboard);
}); 