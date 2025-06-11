import { Scenes, Markup } from 'telegraf';
import type { AuthContext } from '../middlewares/auth';
import { fetchCities, getCityName, type City } from '../utils/cities';
const { match } = require("telegraf-i18n");

export const changeCityScene = new Scenes.BaseScene<AuthContext>('changeCity');


changeCityScene.command('start', async (ctx) => {
 // Leave the current scene to return to the global context
 await ctx.scene.leave();
  
 // Now pass control to the global /start command handler
 // This will trigger the global handler which resets the session
 await ctx.reply(ctx.i18n.t('bot_restarted') || 'Bot has been restarted. Starting from the beginning...');
 
 // Go to language selection scene (now called start scene)
 return ctx.scene.enter('start');
});

// Добавляем обработчик команды /settings
changeCityScene.command('settings', async (ctx) => {
  console.log('ChangeCity scene: /settings command received');
  
  // Выходим из текущей сцены
  await ctx.scene.leave();
  
  // Переходим в сцену настроек
  return ctx.scene.enter('settings');
});

changeCityScene.command('order', async (ctx) => {
  await ctx.scene.enter('newOrder');
});

changeCityScene.command('feedback', async (ctx) => {
  await ctx.scene.enter('callback');
});

changeCityScene.enter(async (ctx) => {
  try {
    // Fetch cities from API
    const cities = await fetchCities();
    
    if (cities.length === 0) {
      await ctx.reply(ctx.i18n.t('changeCity.no_cities'));
      return;
    }
    
    // Get current language
    const language = ctx.i18n.locale();
    
    // Create keyboard with cities
    const cityButtons: string[][] = [];
    let row: string[] = [];
    
    cities.forEach((city, index) => {
      // Get city name in current language
      const cityName = getCityName(city, language);
      
      // Add city to current row
      row.push(cityName);
      
      // Create new row after every 2 cities or if it's the last city
      if (row.length === 2 || index === cities.length - 1) {
        cityButtons.push([...row]);
        row = [];
      }
    });
    
    // Add back button at the bottom
    cityButtons.push([ctx.i18n.t('changeCity.back')]);
    
    const keyboard = Markup.keyboard(cityButtons).resize();
    
    // Save cities in session for later use
    if (!ctx.session) {
      ctx.session = {
        language: 'en',
        registered: false,
        phone: null,
        currentCity: null,
        selectedCity: null
      };
    }
    ctx.session.cities = cities;
    
    // Show city selection message with keyboard
    await ctx.reply(ctx.i18n.t('changeCity.select_city'), keyboard);
    
  } catch (error) {
    console.error('Error in changeCityScene:', error);
    await ctx.reply(ctx.i18n.t('error_occurred'));
  }
});

// Handle back button
changeCityScene.hears(match('changeCity.back'), async (ctx) => {
  await ctx.scene.enter('settings');
});

// Handle city selection
changeCityScene.on('text', async (ctx) => {
  const currentCityName = ctx.message.text;
  
  // Ignore if it's the back button
  if (currentCityName.startsWith('⬅️')) return;
  
  // Get cities from session
  const cities = ctx.session?.cities || [];
  const language = ctx.i18n.locale();
  
  // Find selected city
  const currentCity = cities.find(city => {
    return getCityName(city, language) === currentCityName;
  });
  
  if (currentCity) {
    // Save selected city ID in session
    ctx.session.currentCity = currentCity.id.toString();
    
    // Save only the city ID in the session instead of the entire city object
    ctx.session.selectedCity = currentCity.id;
    
    // Clear the full cities array to save space
    ctx.session.cities = undefined;
    
    // Get city name in current language
    const cityName = getCityName(currentCity, language);
    
    // Confirm city selection
    await ctx.reply(ctx.i18n.t('changeCity.success', { city: cityName }));
    
    // Return to menu
    await ctx.scene.enter('settings');
  }
}); 