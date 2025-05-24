import { Scenes, Markup } from 'telegraf';
import type { MyContext } from '../config/context';
import { fetchCategories, getCategoryName, getCategoryImageUrl } from '../utils/categories';
import type { Category } from '../utils/categories';
import { registerSceneCommandHandlers, shouldSkipCommand } from '../utils/commandMenu';
const { match } = require("telegraf-i18n");

// Temporary variable to store categories during the session lifetime
// This will not be saved in the session JSON
let tempCategories: Category[] = [];

export const categoriesScene = new Scenes.BaseScene<MyContext>('categories');

// Регистрируем глобальные обработчики команд для этой сцены
registerSceneCommandHandlers(categoriesScene, 'Categories');

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
    
    // Add back button and cart button at the top
    const backButtonText = ctx.i18n.t('back');
    const cartButtonText = ctx.i18n.t('cart_button');
    categoryButtons.push([backButtonText, cartButtonText]);
    
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

// Handle cart button
categoriesScene.hears(/^🛒/, async (ctx) => {
  console.log('Cart button pressed in categories scene');
  // Set previous scene for back navigation
  if (!ctx.session) ctx.session = {};
  ctx.session.previousScene = 'categories';
  
  // Show cart contents
  await showCart(ctx);
});

// Handle text messages (category selection)
categoriesScene.on('text', async (ctx) => {
  const messageText = ctx.message.text;
  console.log(`Received text in categories scene: "${messageText}"`);
  
  // Пропускаем команды - они должны обрабатываться обработчиками команд сцены
  if (shouldSkipCommand(messageText, 'Categories')) {
    return;
  }
  
  // Handle cart button
  if (messageText === ctx.i18n.t('cart_button') || 
      messageText.includes('🛒') ||
      messageText.includes('Корзина') ||
      messageText.includes('Cart') ||
      messageText.includes('Savat')) {
    console.log('Cart button detected in categories scene');
    // Set previous scene for back navigation
    ctx.session.previousScene = 'categories';
    await showCart(ctx);
    return;
  }
  
  // Handle clear cart
  if (messageText === ctx.i18n.t('cart.clear') || 
      messageText.includes('Очистить') ||
      messageText.includes('Clear') ||
      messageText.includes('Tozalash')) {
    console.log('Clear cart button pressed');
    const userId = ctx.from?.id;
    if (userId) {
      userCarts.set(userId, { items: [], total: 0 });
      await ctx.reply(ctx.i18n.t('cart.cleared') || 'Корзина очищена');
      await showCart(ctx);
    }
    return;
  }

  // Handle checkout
  if (messageText === ctx.i18n.t('cart.checkout') || 
      messageText.includes('Оформить') ||
      messageText.includes('Checkout') ||
      messageText.includes('Buyurtma')) {
    console.log('Checkout button pressed');
    await ctx.reply(ctx.i18n.t('cart.checkout_message') || 'Функция оформления заказа будет добавлена позже');
    return;
  }
  
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


categoriesScene.hears(match('feedback.review'), async (ctx) => {
  // Enter the review scene
  await ctx.scene.enter('review');
});

categoriesScene.hears(match('feedback.back'), async (ctx) => {
  await ctx.scene.enter('mainMenu');
});

categoriesScene.command('feedback', async (ctx) => {
console.log('Feedback command received in callback scene, reloading the scene');
await ctx.scene.reenter(); // Reenter the same scene to reset it
});

// Cart functionality
const userCarts = new Map<number, {items: Array<{id: number, name: string, price: number, quantity: number}>, total: number}>();

// Initialize cart for user if it doesn't exist
function getOrCreateCart(userId: number) {
  if (!userCarts.has(userId)) {
    userCarts.set(userId, {
      items: [],
      total: 0
    });
  }
  return userCarts.get(userId)!;
}

// Show cart contents
async function showCart(ctx: MyContext) {
  try {
    const userId = ctx.from?.id;
    if (!userId) {
      await ctx.reply(ctx.i18n.t('error') || 'User ID not found');
      return;
    }

    const cart = getOrCreateCart(userId);

    if (cart.items.length === 0) {
      await ctx.reply(
        ctx.i18n.t('cart.empty') || 'Ваша корзина пуста',
        Markup.keyboard([
          [ctx.i18n.t('back') || 'Back']
        ]).resize()
      );
      return;
    }

    // Build cart message with numbered items
    let cartMessage = `🛒 <b>${ctx.i18n.t('cart.title') || 'Ваша корзина'}:</b>\n\n`;

    // Create inline keyboard for each item
    const inlineButtons: any[][] = [];

    cart.items.forEach((cartItem, index) => {
      const itemTotal = cartItem.price * cartItem.quantity;
      const formattedItemTotal = new Intl.NumberFormat('ru-RU').format(itemTotal);
      cartMessage += `${index + 1}. ${cartItem.name}\n${cartItem.quantity} × ${new Intl.NumberFormat('ru-RU').format(cartItem.price)} = ${formattedItemTotal} сум\n\n`;
      
      // Create inline buttons for this item: [❌ Name] on first row, [-] [quantity] [+] on second row
      inlineButtons.push([
        Markup.button.callback(`❌ ${cartItem.name}`, `remove_item_${cartItem.id}`)
      ]);
      inlineButtons.push([
        Markup.button.callback('-', `decrease_cart_${cartItem.id}`),
        Markup.button.callback(`${cartItem.quantity}`, `item_quantity_${cartItem.id}`),
        Markup.button.callback('+', `increase_cart_${cartItem.id}`)
      ]);
    });

    // Recalculate cart total
    cart.total = cart.items.reduce((total, item) => total + (item.price * item.quantity), 0);
    const formattedTotal = new Intl.NumberFormat('ru-RU').format(cart.total);
    cartMessage += `<b>${ctx.i18n.t('cart.total') || 'Итого'}: ${formattedTotal} сум</b>`;

    // Add action buttons at the bottom
    inlineButtons.push([
      Markup.button.callback(ctx.i18n.t('cart.clear') || 'Очистить корзину', 'clear_cart'),
      Markup.button.callback(ctx.i18n.t('cart.checkout') || 'Оформить заказ', 'checkout_cart')
    ]);

    // Create regular keyboard for back button
    const regularKeyboard = Markup.keyboard([
      [ctx.i18n.t('back') || 'Back']
    ]).resize();

    // Send message with inline keyboard
    await ctx.replyWithHTML(cartMessage, {
      reply_markup: {
        inline_keyboard: inlineButtons
      }
    });

    // Send back button separately
    await ctx.reply(ctx.i18n.t('cart.back_message') || 'Используйте кнопку ниже для возврата:', regularKeyboard);

  } catch (error) {
    console.error('Error showing cart:', error);
    await ctx.reply(ctx.i18n.t('error') || 'Произошла ошибка при отображении корзины');
  }
}

// Function to update cart message without recreating it
async function updateCartMessage(ctx: MyContext) {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;

    const cart = getOrCreateCart(userId);

    if (cart.items.length === 0) {
      // If cart is empty, delete the message and show empty cart
      try {
        await ctx.deleteMessage();
      } catch (error) {
        console.error('Error deleting message:', error);
      }
      await showCart(ctx);
      return;
    }

    // Build cart message with numbered items
    let cartMessage = `🛒 <b>${ctx.i18n.t('cart.title') || 'Ваша корзина'}:</b>\n\n`;

    // Create inline keyboard for each item
    const inlineButtons: any[][] = [];

    cart.items.forEach((cartItem, index) => {
      const itemTotal = cartItem.price * cartItem.quantity;
      const formattedItemTotal = new Intl.NumberFormat('ru-RU').format(itemTotal);
      cartMessage += `${index + 1}. ${cartItem.name}\n${cartItem.quantity} × ${new Intl.NumberFormat('ru-RU').format(cartItem.price)} = ${formattedItemTotal} сум\n\n`;
      
      // Create inline buttons for this item: [❌ Name] on first row, [-] [quantity] [+] on second row
      inlineButtons.push([
        Markup.button.callback(`❌ ${cartItem.name}`, `remove_item_${cartItem.id}`)
      ]);
      inlineButtons.push([
        Markup.button.callback('-', `decrease_cart_${cartItem.id}`),
        Markup.button.callback(`${cartItem.quantity}`, `item_quantity_${cartItem.id}`),
        Markup.button.callback('+', `increase_cart_${cartItem.id}`)
      ]);
    });

    // Recalculate cart total
    cart.total = cart.items.reduce((total, item) => total + (item.price * item.quantity), 0);
    const formattedTotal = new Intl.NumberFormat('ru-RU').format(cart.total);
    cartMessage += `<b>${ctx.i18n.t('cart.total') || 'Итого'}: ${formattedTotal} сум</b>`;

    // Add action buttons at the bottom
    inlineButtons.push([
      Markup.button.callback(ctx.i18n.t('cart.clear') || 'Очистить корзину', 'clear_cart'),
      Markup.button.callback(ctx.i18n.t('cart.checkout') || 'Оформить заказ', 'checkout_cart')
    ]);

    // Update the existing message instead of creating a new one
    await ctx.editMessageText(cartMessage, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: inlineButtons
      }
    });

  } catch (error) {
    console.error('Error updating cart message:', error);
    // Fallback to full recreation if edit fails
    try {
      await ctx.deleteMessage();
    } catch (deleteError) {
      console.error('Error deleting message:', deleteError);
    }
    await showCart(ctx);
  }
}

// Handle cart inline button actions
categoriesScene.action(/remove_item_(\d+)/, async (ctx) => {
  const itemId = parseInt(ctx.match[1]);
  console.log(`Remove item ${itemId} from cart`);
  
  const userId = ctx.from?.id;
  if (!userId) return;
  
  const cart = getOrCreateCart(userId);
  
  // Remove item from cart
  cart.items = cart.items.filter(item => item.id !== itemId);
  
  // Recalculate total
  cart.total = cart.items.reduce((total, item) => total + (item.price * item.quantity), 0);
  
  await ctx.answerCbQuery(ctx.i18n.t('cart.item_removed') || 'Товар удален из корзины');
  
  // Update cart message instead of recreating it
  await updateCartMessage(ctx);
});

categoriesScene.action(/increase_cart_(\d+)/, async (ctx) => {
  const itemId = parseInt(ctx.match[1]);
  console.log(`Increase quantity for item ${itemId} in cart`);
  
  const userId = ctx.from?.id;
  if (!userId) return;
  
  const cart = getOrCreateCart(userId);
  
  // Find and increase quantity
  const item = cart.items.find(item => item.id === itemId);
  if (item && item.quantity < 20) {
    item.quantity++;
    
    // Recalculate total
    cart.total = cart.items.reduce((total, item) => total + (item.price * item.quantity), 0);
    
    await ctx.answerCbQuery();
    
    // Update cart message instead of recreating it
    await updateCartMessage(ctx);
  } else {
    await ctx.answerCbQuery(ctx.i18n.t('cart.max_quantity') || 'Максимальное количество: 20');
  }
});

categoriesScene.action(/decrease_cart_(\d+)/, async (ctx) => {
  const itemId = parseInt(ctx.match[1]);
  console.log(`Decrease quantity for item ${itemId} in cart`);
  
  const userId = ctx.from?.id;
  if (!userId) return;
  
  const cart = getOrCreateCart(userId);
  
  // Find and decrease quantity
  const item = cart.items.find(item => item.id === itemId);
  if (item) {
    if (item.quantity > 1) {
      item.quantity--;
      
      // Recalculate total
      cart.total = cart.items.reduce((total, item) => total + (item.price * item.quantity), 0);
      
      await ctx.answerCbQuery();
      
      // Update cart message instead of recreating it
      await updateCartMessage(ctx);
    } else {
      // If quantity is 1, remove the item
      cart.items = cart.items.filter(item => item.id !== itemId);
      
      // Recalculate total
      cart.total = cart.items.reduce((total, item) => total + (item.price * item.quantity), 0);
      
      await ctx.answerCbQuery(ctx.i18n.t('cart.item_removed') || 'Товар удален из корзины');
      
      // Update cart message instead of recreating it
      await updateCartMessage(ctx);
    }
  }
});

categoriesScene.action(/item_quantity_(\d+)/, async (ctx) => {
  const itemId = parseInt(ctx.match[1]);
  const userId = ctx.from?.id;
  if (!userId) return;
  
  const cart = getOrCreateCart(userId);
  const item = cart.items.find(item => item.id === itemId);
  
  if (item) {
    await ctx.answerCbQuery(`${ctx.i18n.t('products.quantity') || 'Количество'}: ${item.quantity}`);
  }
});

categoriesScene.action('clear_cart', async (ctx) => {
  console.log('Clear cart button pressed');
  const userId = ctx.from?.id;
  if (userId) {
    userCarts.set(userId, { items: [], total: 0 });
    await ctx.answerCbQuery(ctx.i18n.t('cart.cleared') || 'Корзина очищена');
    
    // Update cart message instead of recreating it (will show empty cart)
    await updateCartMessage(ctx);
  }
});

categoriesScene.action('checkout_cart', async (ctx) => {
  console.log('Checkout button pressed');
  await ctx.answerCbQuery();
  await ctx.reply(ctx.i18n.t('cart.checkout_message') || 'Функция оформления заказа будет добавлена позже');
});

// Export cart functions for use in other scenes
export { getOrCreateCart, userCarts }; 