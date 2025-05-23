import { Scenes, Markup } from 'telegraf';
import TelegrafI18n from 'telegraf-i18n';

// Интерфейс для сессии
interface SessionData {
  language?: string;
  registered?: boolean;
  phone?: string | null;
  currentCity?: string | null;
  cities?: any[];
  [key: string]: any;
}

// Исправленный контекст
type MyContext = Scenes.SceneContext & {
  i18n: TelegrafI18n;
  session: SessionData;
};

// Создаем сцену для командного меню
export const commandMenuScene = new Scenes.BaseScene<MyContext>('commandMenu');

// Функция для создания клавиатуры командного меню
const getCommandMenuKeyboard = (ctx: MyContext) => {
  return Markup.keyboard([
    ['/start'],
    ['/order'],
    ['/settings'],
    ['/feedback'],
    [ctx.i18n.t('menu.back')]
  ]).resize();
};

// При входе в сцену
commandMenuScene.enter(async (ctx) => {
  const keyboard = getCommandMenuKeyboard(ctx);
  await ctx.reply(ctx.i18n.t('command_menu'), keyboard);
});

// Обработчики команд
commandMenuScene.command('start', async (ctx) => {
  await ctx.reply('Вы выбрали команду /start');
  await ctx.scene.enter('start'); // Переходим к сцене выбора языка (now called start)
});

commandMenuScene.command('order', async (ctx) => {
  await ctx.reply('Вы выбрали команду /order');
  await ctx.scene.enter('newOrder');
});

commandMenuScene.command('settings', async (ctx) => {
  console.log('CommandMenu scene: /settings command received');
  await ctx.reply('Вы выбрали команду /settings');
  // Сначала выходим из текущей сцены
  console.log('CommandMenu scene: leaving current scene');
  await ctx.scene.leave();
  // Затем переходим в сцену настроек
  console.log('CommandMenu scene: entering settings scene');
  await ctx.scene.enter('settings');
});

commandMenuScene.command('feedback', async (ctx) => {
  await ctx.scene.enter('callback');
});

// Добавляем обработчик кнопки "Назад" с учетом разных языков
// commandMenuScene.hears(/^(Back|Назад|Ortga)$/, async (ctx) => {
//   await ctx.scene.enter('mainMenu');
// });

// Добавляем обработчик для кнопки "order" без слеша
commandMenuScene.hears(['order', 'Order', 'заказ', 'Заказ'], async (ctx) => {
  await ctx.reply('Вы выбрали заказ');
  // Проверяем, зарегистрирован ли пользователь
  if (!ctx.session.registered) {
    await ctx.reply(ctx.i18n.t('registration_required'));
    await ctx.scene.enter('newOrder');
    return;
  }
  // Если зарегистрирован, начинаем процесс заказа
  // await ctx.reply(ctx.i18n.t('order_flow_placeholder'));
  await ctx.scene.enter('newOrder');
});

// Обработчик текста, который не является командой
commandMenuScene.on('text', async (ctx) => {
  const text = ctx.message.text;
  
  // Если текст не является командой, показываем снова меню
  if (!text.startsWith('/')) {
    const keyboard = getCommandMenuKeyboard(ctx);
    await ctx.reply('Пожалуйста, выберите команду из меню ниже:', keyboard);
  }
}); 