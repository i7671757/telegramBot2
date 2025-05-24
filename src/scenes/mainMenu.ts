import { Scenes } from 'telegraf';
import { Markup } from 'telegraf';
import TelegrafI18n from 'telegraf-i18n';
import { registerSceneCommandHandlers, shouldSkipCommand } from '../utils/commandMenu';

// Custom session type
interface MySessionData extends Scenes.SceneSessionData {
  language?: string;
  [key: string]: any;
}

// Improved context type with proper i18n typing
interface MyContext extends Scenes.SceneContext<MySessionData> {
  i18n: TelegrafI18n;
}

// Define button types for type safety
type MainMenuButton = 
  | 'startOrder'
  | 'myOrders'
  | 'settings'
  | 'sale'
  | 'joinTeam'
  | 'callback';
  // | 'categories';

export const mainMenuScene = new Scenes.BaseScene<MyContext>('mainMenu');

// Регистрируем глобальные обработчики команд для этой сцены
registerSceneCommandHandlers(mainMenuScene, 'MainMenu');

// Helper function to create main menu keyboard
const getMainMenuKeyboard = (ctx: MyContext) => {
  return Markup.keyboard([
      [ctx.i18n.t('mainKeyboard.startOrder')],
    [ctx.i18n.t('mainKeyboard.myOrders')],
    [ctx.i18n.t('mainKeyboard.changeSettings'), ctx.i18n.t('mainKeyboard.sale')],
    [ctx.i18n.t('mainKeyboard.joinTeam'), ctx.i18n.t('mainKeyboard.callback')]
  ]).resize();
};

// Helper function to get button key by its text value
const getButtonKey = (ctx: MyContext, text: string): MainMenuButton | null => {
  // Создаем карту соответствия переведенного текста и ключа кнопки
  const buttonMap = {
    [ctx.i18n.t('mainKeyboard.startOrder')]: 'startOrder',
    [ctx.i18n.t('mainKeyboard.myOrders')]: 'myOrders',
    [ctx.i18n.t('mainKeyboard.changeSettings')]: 'settings',
    [ctx.i18n.t('mainKeyboard.sale')]: 'sale',
    [ctx.i18n.t('mainKeyboard.joinTeam')]: 'joinTeam',
    [ctx.i18n.t('mainKeyboard.callback')]: 'callback'
  } as const;

  console.log(`Looking for match for text: "${text}"`);
  console.log('Button map values:');
  Object.entries(buttonMap).forEach(([key, value]) => {
    console.log(`Key: "${key}" -> Value: "${value}"`);
  });

  // Возвращаем ключ кнопки по переведенному тексту
  const result = (buttonMap[text] as MainMenuButton) || null;
  console.log(`Result: ${result}`);
  return result;
};

// On scene enter
mainMenuScene.enter(async (ctx) => {
  const keyboard = getMainMenuKeyboard(ctx);
  await ctx.reply(ctx.i18n.t('main_menu'), keyboard);
});

// Add the /start command handler to restart the bot
mainMenuScene.command('start', async (ctx) => {
  // Leave the current scene to return to the global context
  await ctx.scene.leave();
  
  // Now pass control to the global /start command handler
  // This will trigger the global handler which resets the session
  await ctx.reply(ctx.i18n.t('bot_restarted') || 'Bot has been restarted. Starting from the beginning...');
  
  // Go to language selection scene (now called start scene)
  return ctx.scene.enter('start');
});

// Add the /settings command handler to go to settings scene
mainMenuScene.command('settings', async (ctx) => {
  console.log('MainMenu scene: /settings command received');
  
  // Leave the current scene
  await ctx.scene.leave();
  
  // Go directly to settings scene
  return ctx.scene.enter('settings');
});

// Add the /categories command handler to view categories
// mainMenuScene.command('categories', async (ctx) => {
//   console.log('MainMenu scene: /categories command received');
//   return ctx.scene.enter('categories');
// });

mainMenuScene.command('order', async (ctx) => {
  await ctx.scene.enter('startOrder');
});

mainMenuScene.command('feedback', async (ctx) => {
  await ctx.scene.enter('callback');
});

// Add command handlers
// mainMenuScene.command('profile', (ctx) => ctx.scene.enter('profile'));
// mainMenuScene.command('language', (ctx) => ctx.scene.enter('language'));
// mainMenuScene.command('help', (ctx) => ctx.reply(ctx.i18n.t('help')));
// mainMenuScene.command('menu', (ctx) => {
//   ctx.reply(ctx.i18n.t('command_menu'), 
//     Markup.keyboard([
//       ['/start'],
//       ['/order'],
//       ['/settings'],
//       ['/feedback']
//     ]).resize()
//   );
// });

// Handle button presses
mainMenuScene.hears(/.*/, async (ctx) => {
  const text = ctx.message.text;
  console.log(`Main menu button pressed: "${text}"`);
  
  // Пропускаем команды - они должны обрабатываться обработчиками команд сцены
  if (shouldSkipCommand(text, 'MainMenu')) {
    return;
  }
  
  const buttonKey = getButtonKey(ctx, text);
  console.log(`Mapped button key: ${buttonKey}`);
  
  // Для отладки выведем все ключи в buttonMap
  const buttonMapDebug = {
    [ctx.i18n.t('mainKeyboard.startOrder')]: 'startOrder',
    [ctx.i18n.t('mainKeyboard.myOrders')]: 'myOrders',
    [ctx.i18n.t('mainKeyboard.changeSettings')]: 'settings',
    [ctx.i18n.t('mainKeyboard.sale')]: 'sale',
    [ctx.i18n.t('mainKeyboard.joinTeam')]: 'joinTeam',
    [ctx.i18n.t('mainKeyboard.callback')]: 'callback'
  };
  
  console.log("Available button mappings:", Object.entries(buttonMapDebug).map(([key, value]) => `"${key}" -> "${value}"`));
  
  if (!buttonKey) {
    // Unknown button pressed, show main menu again
    console.log('Unknown button, showing main menu again');
    const keyboard = getMainMenuKeyboard(ctx);
    await ctx.reply(ctx.i18n.t('main_menu'), keyboard);
    return;
  }

  // Handle each button press based on the button key
  switch (buttonKey) {
    case 'startOrder':
      // await ctx.reply(ctx.i18n.t('order_flow_placeholder'));
      await ctx.scene.enter('startOrder');
      break;
      
    // case 'categories':
    //   await ctx.scene.enter('categories');
    //   break;
      
    case 'myOrders':
      await ctx.reply(ctx.i18n.t('my_orders_placeholder'));
      break;
      
    case 'settings':
      await ctx.scene.leave();
      await ctx.scene.enter('settings');
      break;
      
    case 'sale':
      await ctx.reply(ctx.i18n.t('promotions_placeholder'));
      break;
      
    case 'joinTeam':
      await ctx.reply(ctx.i18n.t('join_team_placeholder'),
        Markup.inlineKeyboard([
          [Markup.button.url(ctx.i18n.t('goTo'), 'http://t.me/HavoqandJamoa_Bot')]
        ])
      );
      

      break;
      
    case 'callback':
      // await ctx.reply(ctx.i18n.t('feedback_placeholder'));
      await ctx.scene.enter('callback');
      break;
  }
}); 