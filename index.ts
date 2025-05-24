import { Elysia } from 'elysia';
import { Telegraf, Scenes, Markup } from 'telegraf';
import path from 'path';
import LocalSession from 'telegraf-session-local';
import { i18n } from './src/middlewares/i18n';
import { fetchCities, getCityName, getCityById } from './src/utils/cities';
import type { City } from './src/utils/cities';
import { mainMenuScene } from './src/scenes/mainMenu';
import { menuScene } from './src/scenes/menu.scene';
import { changeNameScene } from './src/scenes/changeName.scene';
import { changeNumberScene } from './src/scenes/changeNumber.scene';
import { changeCityScene } from './src/scenes/changeCity.scene';
import { branchInfoScene } from './src/scenes/branchInfo.scene';
import { config } from './src/config';
import { sendCommandMenu, setLocalizedCommands, registerGlobalCommandHandlers } from './src/utils/commandMenu';
import { settingsScene } from './src/scenes/settings.scene';
import { callbackScene } from './src/scenes/callback.scene';
import { reviewScene } from './src/scenes/review.scene';
import { startOrderScene } from './src/scenes/startOrder.scene';
import { categoriesScene } from './src/scenes/categories.scene';
import { productsScene } from './src/scenes/products.scene';
import { startScene } from './src/scenes/start.scene';
import { newOrderScene } from './src/scenes/newOrder.scene';
import fs from 'fs';
// Use any type for now to avoid complex type conflicts
type MyContext = any;
// Check for environment variables
const BOT_TOKEN = config.botToken;
if (!BOT_TOKEN) {
  console.error('BOT_TOKEN must be provided in .env file');
  process.exit(1);
}

// Initialize local session storage
const localSession = new LocalSession({
  // Database name/path, where sessions will be saved
  database: config.sessionPath,
  // Name of session property in Telegraf Context
  property: 'session',
  // Format of storage (json or other supported by jsonfile)
  format: {
    serialize: (obj) => JSON.stringify(obj, null, 2),
    deserialize: (str) => JSON.parse(str),
  },
  // Default session state when no data is available
  state: { 
    language: 'en',
    registered: false,
    phone: null,
    currentCity: null,
    selectedCity: null
  } // По умолчанию английский, но можно использовать любой доступный язык
});

// Initialize the bot
const bot = new Telegraf(BOT_TOKEN);

// Установка системных команд для меню бота
try {
  const commands = [
    { command: 'start', description: 'Запустить бота' },
    { command: 'order', description: 'Сделать заказ' },
    { command: 'settings', description: 'Настройки' },
    { command: 'feedback', description: 'Обратная связь' },
    { command: 'categories', description: 'Просмотр категорий товаров' }
  ];
  
  // Пробуем установить команды
  if (bot.telegram && typeof bot.telegram.setMyCommands === 'function') {
    bot.telegram.setMyCommands(commands)
      .then(() => console.log('Bot commands have been set up successfully'))
      .catch(error => console.error('Error setting bot commands:', error));
  } else {
    console.log('Warning: Bot command setting methods not available. Default commands not set.');
    console.log('This will not affect core bot functionality.');
  }
} catch (error) {
  console.error('Error setting bot commands:', error);
}

// Registration scene
const registerScene = new Scenes.BaseScene<MyContext>('register');
registerScene.enter((ctx) => {
  // Create keyboard with contact sharing button
  const keyboard = Markup.keyboard([
    [Markup.button.contactRequest(ctx.i18n.t('share_contact'))]
  ]).resize();
  
  ctx.reply(ctx.i18n.t('register'), keyboard);
});

// Handle contact sharing
registerScene.on('contact', (ctx) => {
  const contact = ctx.message.contact;
  const phone = contact.phone_number;
  
  // Проверяем, что сессия существует
  if (!ctx.session) {
    ctx.session = {
      language: ctx.i18n.locale() || 'en',
      registered: false,
      phone: null,
      currentCity: null,
      selectedCity: null
    };
  }
  
  // Save contact info in session
  ctx.session.registered = true;
  ctx.session.phone = phone;
  
  // Thank the user and go to welcome scene
  ctx.reply(ctx.i18n.t('contact_received', { phone }));
  ctx.scene.enter('welcome');
});

// Welcome scene
const welcomeScene = new Scenes.BaseScene<MyContext>('welcome');
welcomeScene.enter(async (ctx) => {
  console.log('Welcome scene entered');
  // Инициализируем сессию, если она пуста
  if (!ctx.session) {
    ctx.session = { 
      language: 'en',
      registered: false,
      phone: null,
      currentCity: null,
      selectedCity: null
    };
    console.log('Session initialized with default values');
  }
  
  try {
    // Получаем список городов из API
    console.log('Fetching cities from API...');
    const cities = await fetchCities();
    
    console.log(`Fetched ${cities.length} cities from API`);
    
    if (cities.length === 0) {
      console.log('No cities returned from API');
      ctx.reply('Ошибка загрузки городов. Пожалуйста, попробуйте позже.');
      return;
    }
    
    // Определяем текущий язык
    const language = ctx.i18n.locale();
    console.log(`Current language: ${language}`);
    
    // Создаем клавиатуру с городами
    const cityButtons: string[][] = [];
    let row: string[] = [];
    
    cities.forEach((city, index) => {
      // Получаем название города на нужном языке
      const cityName = getCityName(city, language);
      
      // Добавляем город в текущий ряд
      row.push(cityName);
      
      // Каждые 2 города создаем новый ряд
      if (row.length === 2 || index === cities.length - 1) {
        cityButtons.push([...row]);
        row = [];
      }
    });
    
    // Добавляем нижний ряд с кнопками языка и помощи
    // cityButtons.push(['/language', '/help']);
    
    const keyboard = Markup.keyboard(cityButtons).resize();
    
    console.log('City buttons created:', cityButtons);
    
    // Отправляем сообщение с клавиатурой
    ctx.reply(ctx.i18n.t('welcome'), keyboard);
    
    // Сохраняем города в сессии для использования в обработчиках
    ctx.session.cities = cities;
    console.log('Cities saved to session');
    
  } catch (error) {
    console.error('Error in welcomeScene:', error);
    ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
  }
});

// Обработчик для выбора города
welcomeScene.on('text', (ctx) => {
  const text = ctx.message.text;
  console.log(`Received text: "${text}"`);

  // Обработка команд
  if (text === '/start') {
    console.log('Restarting: entering start scene');
    return ctx.scene.enter('start');
  }
    // if (text === '/help') {
    //   return ctx.reply(ctx.i18n.t('help'));
    // }
    // if (text === '/language') {
    //   return ctx.scene.enter('start');
    // }
  if (text === '/register') {
    return ctx.scene.enter('register');
  }
  if (text === '/menu') {
    return ctx.scene.enter('commandMenu');
  }

  // Получаем список городов из сессии
  const cities = ctx.session.cities || [];
  const language = ctx.i18n.locale();
  console.log(`Looking for city match for "${text}" in ${cities.length} cities`);

  // Ищем выбранный город
  const currentCity = cities.find((city: City) => {
    // Проверяем совпадение названия на любом языке
    const matchRu = getCityName(city, 'ru') === text;
    const matchEn = getCityName(city, 'en') === text;
    const matchUz = getCityName(city, 'uz') === text;
    if (matchRu || matchEn || matchUz) {
      console.log(`City match found: ${city.slug}`);
    }
    return matchRu || matchEn || matchUz;
  });

  if (currentCity) {
    // Сохраняем ID выбранного города в сессии
    ctx.session.currentCity = currentCity.id.toString();
    console.log(`Selected city saved to session: ${currentCity.id}`);
    
    // Save only the city ID in the session instead of the entire city object
    ctx.session.selectedCity = currentCity.id;
    
    // Clear the full cities array to save space
    ctx.session.cities = undefined;
    
    // Получаем название города на текущем языке
    const cityName = getCityName(currentCity, language);
    // Отправляем сообщение об успешном выборе города
    ctx.reply(ctx.i18n.t('city_selected', { city: cityName }));
    // Переходим в главное меню после выбора города
    ctx.scene.enter('mainMenu');
  } else {
    console.log('No city match found');
  }
});

// Profile scene
const profileScene = new Scenes.BaseScene<MyContext>('profile');
profileScene.enter(async (ctx) => {
  // Проверяем целостность сессии
  if (!ctx.session) {
    console.log('Session is missing, initializing with defaults');
    ctx.session = {
      language: 'en',
      registered: false,
      phone: null,
      currentCity: null,
      selectedCity: null
    };
  }

  // Check if user is registered
  if (!ctx.session.registered) {
    ctx.reply(ctx.i18n.t('registration_required'));
    return ctx.scene.enter('register');
  }
  
  const userId = ctx.from?.id || 'unknown';
  const name = ctx.from?.first_name || 'unknown';
  const phone = ctx.session.phone || 'unknown';
  
  // Получаем информацию о выбранном городе
  let cityName = 'N/A';
  if (ctx.session.selectedCity) {
    // Get city by ID from API
    const city = await getCityById(ctx.session.selectedCity);
    if (city) {
      cityName = getCityName(city, ctx.i18n.locale());
    }
  } else if (ctx.session.currentCity) {
    // Fallback to currentCity if selectedCity is not available
    const city = await getCityById(ctx.session.currentCity);
    if (city) {
      cityName = getCityName(city, ctx.i18n.locale());
    }
  }
  
  const keyboard = Markup.keyboard([
    ['/back']
  ]).resize();
  
  // Include phone number and city in profile
  const profileText = `${ctx.i18n.t('profile', { id: userId, name })}\nPhone: ${phone}\nCity: ${cityName}`;
  ctx.reply(profileText, keyboard);
});
profileScene.command('back', (ctx: any) => ctx.scene.enter('welcome'));
profileScene.on('message', (ctx) => ctx.reply(ctx.i18n.t('back')));

// Create and register all scenes
const stage = new Scenes.Stage<MyContext>([
  startScene,
  registerScene,
  welcomeScene,
  profileScene,
  mainMenuScene,
  menuScene,
  changeNameScene,
  changeNumberScene,
  changeCityScene,
  branchInfoScene,
  settingsScene,
  callbackScene,
  reviewScene,
  startOrderScene,
  categoriesScene,
  productsScene,
  newOrderScene
]);

// Register middlewares
bot.use(localSession.middleware());
bot.use(i18n.middleware());
bot.use(stage.middleware());

// Регистрируем глобальные обработчики команд, которые работают в любой сцене
registerGlobalCommandHandlers(bot);

// Handlers for the startScene (formerly languageScene)
startScene.hears('🇬🇧 English', async (ctx) => {
  console.log('English language selected');
  ctx.i18n.locale('en');
  
  // Устанавливаем локализованные команды меню для пользователя
  await setLocalizedCommands(bot, ctx, true);
  // Также устанавливаем команды глобально, если у нас много пользователей с этим языком
  await setLocalizedCommands(bot, ctx, false);
  
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
  await setLocalizedCommands(bot, ctx, true);
  // Также устанавливаем команды глобально, если у нас много пользователей с этим языком
  await setLocalizedCommands(bot, ctx, false);
  
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
  await setLocalizedCommands(bot, ctx, true);
  // Также устанавливаем команды глобально, если у нас много пользователей с этим языком
  await setLocalizedCommands(bot, ctx, false);
  
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

// Команда меню для вызова интерфейса с командами
bot.command('menu', async (ctx: any) => {
  await ctx.scene.enter('commandMenu');
});

// Error handling
bot.catch((err: any, ctx: any) => {
  console.error(`Error for ${ctx.updateType}`, err);
  
  // Определяем тип ошибки и отправляем соответствующее сообщение
  if (err.message && err.message.includes('session')) {
    ctx.reply(ctx.i18n.t('error_occurred'));
    console.error('Session error:', err);
  } else if (err.message && err.message.includes('not registered')) {
    ctx.reply(ctx.i18n.t('registration_required'));
  } else if (err.code && err.code === 400) {
    ctx.reply(ctx.i18n.t('error_occurred'));
    console.error('Telegram API error:', err);
  } else {
    ctx.reply(ctx.i18n.t('error_occurred'));
    console.error('Unknown error:', err);
  }
});

// Start the bot
bot.launch()
  .then(() => {
    console.log('Bot started successfully');
    
    // Устанавливаем глобальные команды меню по умолчанию (на английском)
    // Используем false для параметра forUser, чтобы установить команды глобально для всех пользователей
    const defaultContext = {
      i18n: {
        locale: () => 'en'
      }
    };
    
    setLocalizedCommands(bot, defaultContext, false)
      .then(() => console.log('Default bot commands have been set up globally'))
      .catch(error => console.error('Error setting default bot commands:', error));

    // Utility function to convert the old cities array structure to the new selectedCity format
    function updateSessionsWithSelectedCity() {
      try {
        // Read sessions file
        const sessionsFile = fs.readFileSync('sessions.json', 'utf8');
        const sessions = JSON.parse(sessionsFile);
        
        // Check if there are sessions
        if (sessions.sessions && sessions.sessions.length > 0) {
          // Process each session
          sessions.sessions.forEach((session: { id: string; data: any }) => {
            const sessionData = session.data;
            
            // If session has currentCity ID and cities array, extract the selected city
            if (sessionData.currentCity && sessionData.cities && Array.isArray(sessionData.cities)) {
              const selectedCity = sessionData.cities.find((city: { id: number | string }) => 
                city.id.toString() === sessionData.currentCity
              );
              
              if (selectedCity) {
                // Save only the city ID instead of the full city object
                sessionData.selectedCity = selectedCity.id;
                // Remove the cities array to save space
                delete sessionData.cities;
                console.log(`Updated session ${session.id} with selectedCity ID: ${selectedCity.id}`);
              }
            }
            
            // If session has selectedCity as full object, convert it to ID only
            if (sessionData.selectedCity && typeof sessionData.selectedCity === 'object' && sessionData.selectedCity.id) {
              const cityId = sessionData.selectedCity.id;
              sessionData.selectedCity = cityId;
              console.log(`Converted selectedCity object to ID: ${cityId} for session ${session.id}`);
            }
            
            // If session has selectedBranch as full object, convert it to ID only
            if (sessionData.selectedBranch && typeof sessionData.selectedBranch === 'object' && sessionData.selectedBranch.id) {
              const branchId = sessionData.selectedBranch.id;
              sessionData.selectedBranch = branchId;
              console.log(`Converted selectedBranch object to ID: ${branchId} for session ${session.id}`);
            }
            
            // Remove terminals array if it exists (temporary data)
            if (sessionData.terminals && Array.isArray(sessionData.terminals)) {
              delete sessionData.terminals;
              console.log(`Removed terminals array from session ${session.id}`);
            }
          });
          
          // Write the updated sessions back to the file
          fs.writeFileSync('sessions.json', JSON.stringify(sessions, null, 2));
          console.log('Sessions file updated successfully');
        }
      } catch (error) {
        console.error('Error updating sessions file:', error);
      }
    }

    // Call the function to update existing sessions when the bot starts
    updateSessionsWithSelectedCity();
  })
  .catch((err) => console.error('Failed to start bot:', err));

// Create Elysia server
const app = new Elysia()
  .get('/', () => 'Telegram Bot Server is running')
  .listen(3000);

console.log(`🦊 Elysia server is running at ${app.server?.hostname}:${app.server?.port}`);

// Enable graceful stop
process.once('SIGINT', () => {
  console.log('SIGINT received, stopping bot');
  bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
  console.log('SIGTERM received, stopping bot');
  bot.stop('SIGTERM');
});