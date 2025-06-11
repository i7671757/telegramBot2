import { Scenes, Markup } from 'telegraf';
import type { AuthContext } from '../middlewares/auth';
import { fetchCategories, getCategoryName, getCategoryImageUrl } from '../utils/categories';
import type { Category } from '../utils/categories';
import { registerSceneCommandHandlers, shouldSkipCommand } from '../utils/commandMenu';
const { match } = require("telegraf-i18n");

// Temporary variable to store categories during the session lifetime
// This will not be saved in the session JSON
let tempCategories: Category[] = [];

export const categoriesScene = new Scenes.BaseScene<AuthContext>('categories');

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
  console.log('Feedback command received in categories scene, switching to callback scene');
  return ctx.scene.enter('callback');
});

// Dedicated back button handler
categoriesScene.hears(match('back'), async (ctx) => {
  console.log('Matched back pattern in categories, now entering startOrder scene');
  await ctx.scene.enter('startOrder');
});

// Handle cart button
categoriesScene.hears(/^🛒/, async (ctx) => {
  console.log('Cart button pressed in categories scene');
  // Set previous scene for back navigation
  if (!ctx.session) ctx.session = {
    language: 'en',
    registered: false,
    phone: null,
    currentCity: null,
    selectedCity: null
  };
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
  
  // Handle clear cart FIRST (before cart button to avoid conflicts)
  if (messageText === ctx.i18n.t('cart.clear') || 
      messageText.includes('🗑') ||
      messageText.includes('Очистить') ||
      messageText.includes('Tozalash')) {
    console.log('Clear cart button pressed in categories scene');
    console.log('Message text:', messageText);
    console.log('cart.clear translation:', ctx.i18n.t('cart.clear'));
    
    const userId = ctx.from?.id;
    if (userId) {
      console.log(`Clearing cart for user ${userId}`);
      
      // Get current cart before clearing
      const cartBefore = getOrCreateCart(userId, ctx);
      console.log(`Cart before clearing: ${cartBefore.items.length} items, total: ${cartBefore.total}`);
      
      // Clear the cart
      userCarts.set(userId, { items: [], total: 0 });
      
      // Also clear session cart
      if (ctx.session) {
        ctx.session.cart = { items: [], total: 0, updatedAt: new Date().toISOString() };
      }
      
      // Sync cleared cart to session
      syncCartToSession(userId, ctx);
      
      // Verify cart is cleared
      const cartAfter = getOrCreateCart(userId, ctx);
      console.log(`Cart after clearing: ${cartAfter.items.length} items, total: ${cartAfter.total}`);
      
      await ctx.reply(ctx.i18n.t('cart.cleared'));
      await showCart(ctx);
    } else {
      console.log('No user ID found for cart clearing');
    }
    return;
  }
  
  // Handle cart button (after clear cart to avoid conflicts)
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

  // Handle checkout
  if (messageText === ctx.i18n.t('cart.checkout') || 
      messageText.includes('Оформить') ||
      messageText.includes('Checkout') ||
      messageText.includes('Buyurtma')) {
    console.log('Checkout button pressed');
    await ctx.reply(ctx.i18n.t('checkout.checkout_message') || 'Переходим к оформлению заказа...');
    return ctx.scene.enter('checkout');
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
    if (!ctx.session) ctx.session = {
      language: 'en',
      registered: false,
      phone: null,
      currentCity: null,
      selectedCity: null
    };
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

import { cartService } from '../services/CartService';

// Legacy exports for backward compatibility - will be removed after full migration
export const userCarts = new Map();
export function getOrCreateCart(userId: number, ctx?: AuthContext) {
  return cartService.getOrCreateCart(userId, ctx);
}
export function syncCartToSession(userId: number, ctx: AuthContext) {
  // This is now handled automatically by CartService
  console.log('syncCartToSession called - now handled by CartService');
}

  // Show cart contents
async function showCart(ctx: AuthContext) {
  try {
    console.log('showCart function called in categories scene');
    const userId = ctx.from?.id;
    if (!userId) {
      console.log('No user ID found in showCart');
      await ctx.reply(ctx.i18n.t('error') || 'User ID not found');
      return;
    }

    console.log(`Showing cart for user ${userId}`);
    
    if (cartService.isEmpty(userId, ctx)) {
      console.log('Cart is empty, showing empty message');
      await ctx.reply(
        ctx.i18n.t('cart.empty') || 'Ваша корзина пуста',
        Markup.keyboard([
          [ctx.i18n.t('back') || '⬅️ Назад']
        ]).resize()
      );
      return;
    }

    const cart = cartService.getCart(userId, ctx);
    console.log(`Cart has ${cart.items.length} items, total: ${cart.total}`);

    // Build cart message with numbered items
    let cartMessage = `🛒 <b>${ctx.i18n.t('cart.title') || 'Ваша корзина'}:</b>\n\n`;

    // Create inline keyboard for each item
    const inlineButtons: any[][] = [];

    cart.items.forEach((cartItem, index) => {
      const itemTotal = cartItem.price * cartItem.quantity;
      const formattedItemTotal = new Intl.NumberFormat('ru-RU').format(itemTotal);
      cartMessage += `${index + 1}. ${cartItem.name}\n${cartItem.quantity} × ${new Intl.NumberFormat('ru-RU').format(cartItem.price)} = ${formattedItemTotal} ${ctx.i18n.t('cart.sum')}\n\n`;
      
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
    cartMessage += `<b>${ctx.i18n.t('cart.total') || 'Итого'}: ${formattedTotal} ${ctx.i18n.t('cart.sum')}</b>`;

    // Create regular keyboard with cart actions and back button
    const regularKeyboard = Markup.keyboard([
      [ctx.i18n.t('cart.clear') || '🗑 Очистить корзину', ctx.i18n.t('cart.checkout') || '✅ Оформить заказ'],
      [ctx.i18n.t('back') || '⬅️ Назад']
    ]).resize();

    // Send message with inline keyboard (only for item management)
    await ctx.replyWithHTML(cartMessage, {
      reply_markup: {
        inline_keyboard: inlineButtons
      }
    });

    // Send cart actions in bottom menu
    await ctx.reply(ctx.i18n.t('cart.back_message') || 'Используйте кнопки ниже для управления корзиной:', regularKeyboard);

  } catch (error) {
    console.error('Error showing cart:', error);
    await ctx.reply(ctx.i18n.t('error') || 'Произошла ошибка при отображении корзины');
  }
}

// Function to update cart message without recreating it
async function updateCartMessage(ctx: AuthContext) {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;

    if (cartService.isEmpty(userId, ctx)) {
      // If cart is empty, delete the message and show empty cart
      try {
        await ctx.deleteMessage();
      } catch (error) {
        console.error('Error deleting message:', error);
      }
      await showCart(ctx);
      return;
    }

    const cart = cartService.getCart(userId, ctx);

    // Build cart message with numbered items
    let cartMessage = `🛒 <b>${ctx.i18n.t('cart.title') || 'Ваша корзина'}:</b>\n\n`;

    // Create inline keyboard for each item
    const inlineButtons: any[][] = [];

    cart.items.forEach((cartItem, index) => {
      const itemTotal = cartItem.price * cartItem.quantity;
      const formattedItemTotal = new Intl.NumberFormat('ru-RU').format(itemTotal);
      cartMessage += `${index + 1}. ${cartItem.name}\n${cartItem.quantity} × ${new Intl.NumberFormat('ru-RU').format(cartItem.price)} = ${formattedItemTotal} ${ctx.i18n.t('cart.sum')}\n\n`;
      
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
    cartMessage += `<b>${ctx.i18n.t('cart.total') || 'Итого'}: ${formattedTotal} ${ctx.i18n.t('cart.sum')}</b>`;

    // Update the existing message instead of creating a new one (without cart action buttons)
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
  
  // Use CartService to remove item
  cartService.removeItem(userId, itemId, ctx);
  
  await ctx.answerCbQuery(ctx.i18n.t('cart.item_removed') || 'Товар удален из корзины');
  
  // Update cart message instead of recreating it
  await updateCartMessage(ctx);
});

categoriesScene.action(/increase_cart_(\d+)/, async (ctx) => {
  const itemId = parseInt(ctx.match[1]);
  console.log(`Increase quantity for item ${itemId} in cart`);
  
  const userId = ctx.from?.id;
  if (!userId) return;
  
  const cart = cartService.getCart(userId, ctx);
  const item = cart.items.find(item => item.id === itemId);
  
  if (item && item.quantity < 20) {
    // Use CartService to update quantity
    cartService.updateQuantity(userId, itemId, item.quantity + 1, ctx);
    
    await ctx.answerCbQuery();
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
  
  const cart = cartService.getCart(userId, ctx);
  const item = cart.items.find(item => item.id === itemId);
  
  if (item) {
    if (item.quantity > 1) {
      // Use CartService to update quantity
      cartService.updateQuantity(userId, itemId, item.quantity - 1, ctx);
      await ctx.answerCbQuery();
    } else {
      // If quantity is 1, remove the item
      cartService.removeItem(userId, itemId, ctx);
      await ctx.answerCbQuery(ctx.i18n.t('cart.item_removed') || 'Товар удален из корзины');
    }
    
    await updateCartMessage(ctx);
  }
});

categoriesScene.action(/item_quantity_(\d+)/, async (ctx) => {
  const itemId = parseInt(ctx.match[1]);
  const userId = ctx.from?.id;
  if (!userId) return;
  
  const cart = cartService.getCart(userId, ctx);
  const item = cart.items.find(item => item.id === itemId);
  
  if (item) {
    await ctx.answerCbQuery(`${ctx.i18n.t('products.quantity') || 'Количество'}: ${item.quantity}`);
  }
});



// Cart functions are now exported above near their definitions 