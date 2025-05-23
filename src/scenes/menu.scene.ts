import { Scenes, Markup } from 'telegraf';
import type { MyContext } from '../config/context';

interface Terminal {
  name: string;
  name_uz: string;
  name_en: string;
  desc: string;
  desc_uz: string;
  desc_en: string;
  active: boolean;
}

export const menuScene = new Scenes.BaseScene<MyContext>('menu');

// Helper function to get branch name based on language
const getBranchName = (terminal: Terminal, language: string): string => {
  switch (language) {
    case 'uz':
      return terminal.name_uz || terminal.name;
    case 'en':
      return terminal.name_en || terminal.name;
    default:
      return terminal.name;
  }
};

// Helper function to get branch description based on language
const getBranchDesc = (terminal: Terminal, language: string): string => {
  switch (language) {
    case 'uz':
      return terminal.desc_uz || terminal.desc || '';
    case 'en':
      return terminal.desc_en || terminal.desc || '';
    default:
      return terminal.desc || '';
  }
};

menuScene.enter(async (ctx) => {
  const keyboard = Markup.keyboard([
    [ctx.i18n.t('menu.change_name'), ctx.i18n.t('menu.change_number')],
    [ctx.i18n.t('menu.change_city'), ctx.i18n.t('menu.change_language')],
    [ctx.i18n.t('menu.branch_info'), ctx.i18n.t('menu.public_offer')],
    [ctx.i18n.t('menu.back')]
  ]).resize();

  await ctx.reply(ctx.i18n.t('menu.title'), keyboard);
});

// Добавляем обработчик команды /settings
menuScene.command('settings', async (ctx) => {
  console.log('Menu scene: /settings command received');
  
  // Если мы уже находимся в меню настроек, просто обновляем его
  // В противном случае, переходим в сцену настроек
  await ctx.scene.leave();
  return ctx.scene.enter('settings');
});

menuScene.command('order', async (ctx) => {
  await ctx.scene.enter('newOrder');
});

menuScene.command('feedback', async (ctx) => {
  await ctx.scene.enter('feedback');
});

// Handle all text messages
menuScene.on('text', async (ctx) => {
  const text = ctx.message.text;

  // Handle each button based on the translated text
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
    // Show language selection keyboard
    const keyboard = Markup.keyboard([
      [
        ctx.i18n.t('changeLanguage.languages.ru'),
        ctx.i18n.t('changeLanguage.languages.uz'),
        ctx.i18n.t('changeLanguage.languages.en')
      ],
      [ctx.i18n.t('menu.back')]
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
  // Handle language selection
  else if (text.match(/🇷🇺.*Русский/)) {
    if (!ctx.session) ctx.session = {};
    ctx.session.language = 'ru';
    ctx.i18n.locale('ru');
    await ctx.reply(ctx.i18n.t('changeLanguage.success'));
    // Return to menu with updated language
    await ctx.scene.reenter();
  }
  else if (text.match(/🇺🇿.*O'zbekcha/)) {
    if (!ctx.session) ctx.session = {};
    ctx.session.language = 'uz';
    ctx.i18n.locale('uz');
    await ctx.reply(ctx.i18n.t('changeLanguage.success'));
    // Return to menu with updated language
    await ctx.scene.reenter();
  }
  else if (text.match(/🇬🇧.*English/)) {
    if (!ctx.session) ctx.session = {};
    ctx.session.language = 'en';
    ctx.i18n.locale('en');
    await ctx.reply(ctx.i18n.t('changeLanguage.success'));
    // Return to menu with updated language
    await ctx.scene.reenter();
  }
}); 