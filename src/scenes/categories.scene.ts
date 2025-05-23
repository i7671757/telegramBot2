import { Scenes, Markup } from 'telegraf';
import type { MyContext } from '../config/context';
import { fetchCategories, getCategoryName, getCategoryImageUrl } from '../utils/categories';
import type { Category } from '../utils/categories';
const { match } = require("telegraf-i18n");

// Temporary variable to store categories during the session lifetime
// This will not be saved in the session JSON
let tempCategories: Category[] = [];

export const categoriesScene = new Scenes.BaseScene<MyContext>('categories');

categoriesScene.enter(async (ctx) => {
  try {
    // Show loading message
    const loadingMessage = await ctx.reply(ctx.i18n.t('loading') || 'Loading...');
    
    // Fetch categories from API
    const categories = await fetchCategories();
    
    // Delete loading message
    await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMessage.message_id);
    
    if (!categories || categories.length === 0) {
      await ctx.reply(ctx.i18n.t('categories.empty') || 'No categories available');
      return;
    }
    
    // Store categories in temporary variable instead of session
    tempCategories = categories;
    
    // Get current language
    const language = ctx.i18n.locale();
    
    // Define emoji icons for categories to match the image exactly
    const categoryIcons: Record<string, string> = {
      'Ortga': '✈️',
      'Savat': '🧊',
      'Setlar': '🍱',
      'Tovuq': '🍗',
      'Sneklar': '🍟',
      'Lesterlar': '🌮',
      'Burgerlar': '🍔',
      'Longerlar/Hot-dog': '🌭'
    };
    
    // Build keyboard with categories in a grid (2 buttons per row)
    const categoryButtons: any[] = [];
    let row: any[] = [];
    
    categories.forEach((category, index) => {
      const categoryName = getCategoryName(category, language);
      // Use icon from API if available, otherwise use our emoji mapping or default emoji
      const icon = category.icon || categoryIcons[categoryName] || '🍽️';
      
      // Add button for this category
      row.push(`${icon} ${categoryName}`);
      
      // Create a new row after every 2 buttons or at the end
      if (row.length === 2 || index === categories.length - 1) {
        categoryButtons.push([...row]);
        row = [];
      }
    });
    
    // Add back button at the bottom (centered)
    const backButtonText = ctx.i18n.t('back');
    categoryButtons.push([backButtonText]);
    
    const keyboard = Markup.keyboard(categoryButtons).resize();
    
    // Show menu title to match the image
    await ctx.replyWithHTML(
      '<b>Menu</b>',
      keyboard
    );
    
  } catch (error) {
    console.error('Error in categories scene:', error);
    await ctx.reply(ctx.i18n.t('error') || 'An error occurred. Please try again.');
  }
});

// Добавляем обработчики команд, чтобы они перехватывались до обработки текста
categoriesScene.command('feedback', async (ctx) => {
  console.log('Feedback command received in categories scene, switching to feedback scene');
  return ctx.scene.enter('feedback');
});

// Dedicated back button handler
categoriesScene.hears(match('menu.back'), async (ctx) => {
  console.log('Matched menu.back pattern in categories, now entering mainMenu scene');
  await ctx.scene.enter('startOrder');
});

// Additional specific back button handler with more logging
categoriesScene.hears(/^(Back|Назад|Ortga)$/, async (ctx) => {
  console.log('Direct back button match detected in categories scene, entering mainMenu');
  return ctx.scene.enter('startOrder');
});

// Handle text messages (category selection)
categoriesScene.on('text', async (ctx) => {
  const messageText = ctx.message.text;
  console.log(`Received text in categories scene: "${messageText}"`);
  
  // Handle back button directly by comparing the full text - go to main menu instead of newOrder
  if (messageText === ctx.i18n.t('back') || 
      messageText.includes(ctx.i18n.t('back')) ||
      messageText.includes('Orqaga') ||
      messageText.includes('Назад') ||
      messageText.includes('Back')) {
    console.log('Back button detected in categories scene, entering mainMenu scene');
    return ctx.scene.enter('startOrder');
  }
  
  // Extract category name without emoji for category matching
  const categoryNameWithoutEmoji = messageText.replace(/^[\p{Emoji}\s]+/u, '').trim();
  console.log(`Text after emoji removal: "${categoryNameWithoutEmoji}"`);
  
  // Get current language
  const language = ctx.i18n.locale();
  
  // Get categories from temporary variable instead of session
  const categories = tempCategories;
  
  // Try to find the selected category
  const selectedCategory = categories.find(category => {
    const categoryName = getCategoryName(category, language);
    return categoryNameWithoutEmoji === categoryName || messageText.includes(categoryName);
  });
  
  if (selectedCategory) {
    console.log(`Selected category: ${JSON.stringify(selectedCategory)}`);
    // Save only the selected category in session
    if (!ctx.session) ctx.session = {};
    ctx.session.selectedCategory = selectedCategory;
    
    // Сразу переходим к сцене продуктов
    return ctx.scene.enter('products');
  } else {
    console.log(`Category not found for text: "${categoryNameWithoutEmoji}"`);
    await ctx.reply(ctx.i18n.t('categories.not_found') || 'Category not found');
  }
});