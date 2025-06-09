import { Scenes, Markup, Input } from 'telegraf';
import type { AuthContext } from '../middlewares/auth';
import axios from 'axios';
const { match } = require("telegraf-i18n");

export const newOrderScene = new Scenes.BaseScene<AuthContext>('newOrder');




// Types for API responses
interface FoodItem {
  id: number;
  name: string;
  description: string;
  price: number;
  image: string;
}

// Cart state (simple implementation)
const userCarts = new Map<number, {items: Array<{id: number, quantity: number}>, total: number}>();

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

// Scene entry point
newOrderScene.enter(async (ctx) => {
  console.log('Entering newOrder scene');
  
  // Check if we're coming from categories scene (by checking for a session flag if available)
  // For now, we'll check if selectedCategory exists in session
  if (ctx.session?.selectedCategory) {
    console.log('Coming from categories, returning to main menu');
    // Clear category selection to prevent loops
    ctx.session.selectedCategory = undefined;
    return ctx.scene.enter('mainMenu');
  }
  
  await ctx.reply(
    ctx.i18n.t('newOrder.welcome') || 'Выберите продукт:',
    Markup.keyboard([
      [ctx.i18n.t('back') || 'Назад']
    ]).resize()
  );
  
  // Comment out the call to displayFoodItems as it's not implemented
  // await displayFoodItems(ctx);
  
  // Instead, just show a message that tells the user to select a category
  await ctx.reply(ctx.i18n.t('newOrder.select_category') || 'Выберите категорию для просмотра товаров');
  
  // Go directly to categories scene
  return ctx.scene.enter('categories');
});

// Function to fetch food items from API
async function getFoodItems(): Promise<FoodItem[]> {
  try {
    // Fetch popular products or from a specific category
    // Here we'll use a specific category ID for example (burgers = 7)
    const categoryId = 7;
    const response = await axios.get(`${process.env.API_URL}category/${categoryId}/products`);
    
    console.log('API response status:', response.status);
    
    if (response.data.success) {
      // Map API response to our FoodItem format
      return response.data.data.map((item: any) => ({
        id: item.id,
        name: item.attribute_data.name.chopar.ru || item.custom_name,
        description: item.attribute_data.description?.chopar?.ru || '',
        price: parseFloat(item.price),
        // Используем asset массив для получения изображения, если доступен
        image: item.asset && item.asset.length > 0 && item.asset[0]?.link 
          ? item.asset[0].link 
          : item.image
      }));
    } else {
      console.error('API error:', response.data.message);
      return [];
    }
  } catch (error) {
    console.error('Error fetching food items:', error);
    return [];
  }
}

// Display all food items with photos and inline keyboards
// async function displayFoodItems(ctx: MyContext) {
//   try {
//     const foodItems = await getFoodItems();
    
//     if (foodItems.length === 0) {
//       await ctx.reply('Не удалось загрузить товары. Пожалуйста, попробуйте позже.');
//       return;
//     }
    
//     for (const item of foodItems) {
//       // Format price
//       const formattedPrice = new Intl.NumberFormat('ru-RU').format(item.price);
      
//       // Create message text - удаляем HTML теги из описания
//       const cleanDescription = item.description.replace(/<\/?[^>]+(>|$)/g, "");
//       const messageText = `<b>${item.name}</b>\n\n${cleanDescription}\n\n<b>Цена: ${formattedPrice} сум</b>`;
      
//       // Create inline keyboard for quantity control and add to cart
//       const inlineKeyboard = Markup.inlineKeyboard([
//         [
//           Markup.button.callback('−', `decrease_${item.id}`),
//           Markup.button.callback('1', `quantity_${item.id}`),
//           Markup.button.callback('+', `increase_${item.id}`)
//         ],
//         [Markup.button.callback(ctx.i18n.t('newOrder.addToCart') || 'Добавить в корзину', `add_to_cart_${item.id}`)]
//       ]);
      
//       try {
//         // Проверяем наличие и валидность URL изображения
//         if (item.image && typeof item.image === 'string' && item.image.startsWith('http')) {
//           console.log(`Отправка фото для товара ${item.id}`);
          
//           try {
//             // Пробуем отправить изображение
//             await ctx.replyWithPhoto(
//               item.image,
//               {
//                 caption: messageText,
//                 parse_mode: 'HTML',
//                 reply_markup: inlineKeyboard.reply_markup
//               }
//             );
//           } catch (photoError: any) {
//             console.error(`Ошибка отправки фото для товара ${item.id}:`, photoError.message || 'Неизвестная ошибка');
//             // Если не удалось отправить фото, отправляем только текст
//             await ctx.replyWithHTML(messageText, inlineKeyboard);
//           }
//         } else {
//           // Нет изображения, отправляем только текст
//           await ctx.replyWithHTML(messageText, inlineKeyboard);
//         }
//       } catch (error) {
//         console.error(`Ошибка отправки товара ${item.id}:`, error);
//         // Если произошла общая ошибка, отправляем только текст
//         await ctx.replyWithHTML(messageText, inlineKeyboard);
//       }
//     }
//   } catch (error) {
//     console.error('Error displaying food items:', error);
//     await ctx.reply('Произошла ошибка при загрузке товаров');
//   }
// }

// Helper functions to validate the callback query message
function isValidCallbackMessage(message: any): boolean {
  return message && message.reply_markup && message.reply_markup.inline_keyboard;
}

function getKeyboardQuantity(message: any): number {
  try {
    return parseInt(message.reply_markup.inline_keyboard[0][1].text);
  } catch (error) {
    return 1;
  }
}

// Handle increase quantity button
newOrderScene.action(/increase_(\d+)/, async (ctx) => {
  if (!ctx.callbackQuery || !ctx.match?.[1]) {
    return;
  }
  
  // Use empty string as fallback for undefined
  await ctx.answerCbQuery('');
  
  const itemId = parseInt(ctx.match[1] as string);
  const message = ctx.callbackQuery.message as any;
  
  if (!isValidCallbackMessage(message)) {
    return;
  }
  
  const quantity = getKeyboardQuantity(message) + 1;
  await updateQuantityKeyboard(ctx, itemId, quantity);
});

// Handle decrease quantity button
newOrderScene.action(/decrease_(\d+)/, async (ctx) => {
  if (!ctx.callbackQuery || !ctx.match?.[1]) {
    return;
  }
  
  // Use empty string as fallback for undefined
  await ctx.answerCbQuery('');
  
  const itemId = parseInt(ctx.match[1] as string);
  const message = ctx.callbackQuery.message as any;
  
  if (!isValidCallbackMessage(message)) {
    return;
  }
  
  const currentQuantity = getKeyboardQuantity(message);
  const quantity = Math.max(1, currentQuantity - 1); // Don't go below 1
  
  await updateQuantityKeyboard(ctx, itemId, quantity);
});

// Handle quantity display button (do nothing)
newOrderScene.action(/quantity_\d+/, async (ctx) => {
  await ctx.answerCbQuery('');
});

// Handle add to cart button
newOrderScene.action(/add_to_cart_(\d+)/, async (ctx) => {
  if (!ctx.callbackQuery || !ctx.from || !ctx.match?.[1]) {
    return;
  }
  
  const itemId = parseInt(ctx.match[1] as string);
  const message = ctx.callbackQuery.message as any;
  
  if (!isValidCallbackMessage(message)) {
    // Use empty string as fallback for undefined
    await ctx.answerCbQuery('Ошибка с клавиатурой');
    return;
  }
  
  const quantity = getKeyboardQuantity(message);
  const userId = ctx.from.id;
  
  try {
    // Get the food item from API
    const foodItems = await getFoodItems();
    const item = foodItems.find(item => item.id === itemId);
    
    if (!item) {
      await ctx.answerCbQuery('Продукт не найден');
      return;
    }
    
    // Get or create user's cart
    const cart = getOrCreateCart(userId);
    
    // Add item to cart or update quantity if already in cart
    const existingItem = cart.items.find(cartItem => cartItem.id === itemId);
    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      cart.items.push({
        id: itemId,
        quantity
      });
    }
    
    // Update total by fetching current prices from API
    cart.total = await recalculateCartTotal(cart.items);
    
    // Confirm addition
    await ctx.answerCbQuery(`${quantity} × ${item.name} добавлено в корзину`);
    
    // Delete the product message (колонка с товаром)
    try {
      if (ctx.callbackQuery && ctx.callbackQuery.message) {
        await ctx.deleteMessage(ctx.callbackQuery.message.message_id);
      }
    } catch (error) {
      console.error('Error deleting product message:', error);
    }
    
    // Show cart summary
    const formattedTotal = new Intl.NumberFormat('ru-RU').format(cart.total);
    await ctx.reply(
      `✅ ${quantity} × ${item.name} добавлено в корзину\nИтого: ${formattedTotal} ${ctx.i18n.t('checkout.sum')}`,
      Markup.inlineKeyboard([
        [Markup.button.callback('🛒 Перейти к корзине', 'view_cart')],
        [Markup.button.callback('🔄 Продолжить покупки', 'continue_shopping')]
      ])
    );
  } catch (error) {
    console.error('Error adding to cart:', error);
    await ctx.answerCbQuery('Ошибка при добавлении в корзину');
  }
});

// Recalculate cart total getting prices from API
async function recalculateCartTotal(items: Array<{id: number, quantity: number}>): Promise<number> {
  try {
    const foodItems = await getFoodItems();
    return items.reduce((total, cartItem) => {
      const foodItem = foodItems.find(item => item.id === cartItem.id);
      return total + (foodItem ? foodItem.price * cartItem.quantity : 0);
    }, 0);
  } catch (error) {
    console.error('Error recalculating cart total:', error);
    // Return the existing total if there's an error
    return 0;
  }
}

// Handle view cart action
newOrderScene.action('view_cart', async (ctx) => {
  await ctx.answerCbQuery('');
  await showCart(ctx);
});

// Handle continue shopping action
newOrderScene.action('continue_shopping', async (ctx) => {
  await ctx.answerCbQuery('Продолжаем покупки');
});

// Update quantity in keyboard
async function updateQuantityKeyboard(ctx: AuthContext, itemId: number, quantity: number) {
  try {
    if (!ctx.callbackQuery) {
      return;
    }
    
    const message = ctx.callbackQuery.message as any;
    if (!isValidCallbackMessage(message)) {
      return;
    }
    
    // Update inline keyboard with new quantity
    message.reply_markup.inline_keyboard[0][1].text = quantity.toString();
    
    // Edit the message with updated keyboard
    if ('message_id' in message && 'chat' in message) {
      await ctx.telegram.editMessageReplyMarkup(
        message.chat.id,
        message.message_id,
        undefined,
        message.reply_markup
      );
    }
  } catch (error) {
    console.error('Error updating quantity keyboard:', error);
  }
}

// Show cart contents
async function showCart(ctx: AuthContext) {
  if (!ctx.from) {
    return;
  }
  
  const userId = ctx.from.id;
  const cart = getOrCreateCart(userId);
  
  if (cart.items.length === 0) {
    await ctx.reply('Ваша корзина пуста');
    return;
  }
  
  try {
    const foodItems = await getFoodItems();
    let cartMessage = '🛒 <b>Ваша корзина:</b>\n\n';
    
    for (const cartItem of cart.items) {
      const item = foodItems.find(item => item.id === cartItem.id);
      if (item) {
        const itemTotal = item.price * cartItem.quantity;
        const formattedItemTotal = new Intl.NumberFormat('ru-RU').format(itemTotal);
        
        cartMessage += `${cartItem.quantity} × ${item.name} = ${formattedItemTotal} ${ctx.i18n.t('checkout.sum')}\n`;
      }
    }
    
    // Recalculate cart total
    cart.total = await recalculateCartTotal(cart.items);
    
    const formattedTotal = new Intl.NumberFormat('ru-RU').format(cart.total);
    cartMessage += `\n<b>Итого: ${formattedTotal} ${ctx.i18n.t('checkout.sum')}</b>`;
    
    // Send cart message without action buttons
    await ctx.replyWithHTML(cartMessage);
    
    // Send cart actions in bottom menu
    await ctx.reply('Используйте кнопки ниже для управления корзиной:', 
      Markup.keyboard([
        [ctx.i18n.t('cart.clear') || '🗑 Очистить корзину', ctx.i18n.t('cart.checkout') || '✅ Оформить заказ'],
        ['🔄 Продолжить покупки', ctx.i18n.t('back') || '⬅️ Назад']
      ]).resize()
    );
  } catch (error) {
    console.error('Error showing cart:', error);
    await ctx.reply('Произошла ошибка при отображении корзины');
  }
}



// Handle back to main menu action
newOrderScene.action('back_to_main', async (ctx) => {
  await ctx.answerCbQuery('');
  await ctx.scene.enter('mainMenu');
});

// Handle the match pattern for back button (for i18n support)
newOrderScene.hears(match('back'), async (ctx) => {
  console.log('back match detected in newOrder scene');
  return ctx.scene.enter('mainMenu');
});

// Handle any other text message
newOrderScene.on('text', async (ctx) => {
  console.log(`Received text in newOrder scene: "${ctx.message.text}"`);
  
  const messageText = ctx.message.text;
  
  // Handle clear cart button
  if (messageText === ctx.i18n.t('cart.clear') || 
      messageText.includes('🗑') || 
      messageText.includes('Очистить корзину') ||
      messageText.includes('Tozalash')) {
    console.log('Clear cart button pressed in newOrder scene');
    console.log('Message text:', messageText);
    console.log('cart.clear translation:', ctx.i18n.t('cart.clear'));
    
    if (!ctx.from) {
      console.log('No user found for cart clearing');
      return;
    }
    
    const userId = ctx.from.id;
    console.log(`Clearing cart for user ${userId}`);
    
    // Import cart functions from categories scene for consistency
    const { userCarts: mainUserCarts, syncCartToSession, getOrCreateCart } = await import('./categories.scene');
    
    // Get current cart before clearing
    const cartBefore = getOrCreateCart(userId, ctx);
    console.log(`Cart before clearing: ${cartBefore.items.length} items, total: ${cartBefore.total}`);
    
    // Clear both local and main cart
    userCarts.set(userId, { items: [], total: 0 });
    mainUserCarts.set(userId, { items: [], total: 0 });
    
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
    return;
  }
  
  // Handle checkout button
  if (messageText === ctx.i18n.t('cart.checkout') || 
      messageText.includes('✅') || 
      messageText.includes('Оформить заказ') ||
      messageText.includes('Checkout') ||
      messageText.includes('Buyurtma')) {
    console.log('Checkout button pressed');
    if (!ctx.from) return;
    
    await ctx.reply(ctx.i18n.t('checkout.checkout_message') || 'Переходим к оформлению заказа...');
    // Enter checkout scene
    return ctx.scene.enter('checkout');
  }
  
  // Handle continue shopping button
  if (messageText.includes('🔄') || messageText.includes('Продолжить покупки')) {
    console.log('Continue shopping button pressed');
    await ctx.reply('Продолжаем покупки');
    return;
  }
  
  // Check if it's a back button press that wasn't caught by other handlers
  if (ctx.message.text === ctx.i18n.t('back') || 
      ctx.message.text.includes('Назад') || 
      ctx.message.text.includes('Back') || 
      ctx.message.text.includes('Orqaga')) {
    console.log('Back text detected in text handler');
    return ctx.scene.enter('mainMenu');
  }
  
  await ctx.reply(
    ctx.i18n.t('newOrder.help') || 'Используйте кнопки для выбора продуктов',
    Markup.keyboard([
      [ctx.i18n.t('back') || 'Назад']
    ]).resize()
  );
}); 


newOrderScene.hears(match('feedback.review'), async (ctx) => {
  // Enter the review scene
  await ctx.scene.enter('review');
});

newOrderScene.hears(match('feedback.back'), async (ctx) => {
  await ctx.scene.enter('mainMenu');
});

newOrderScene.command('feedback', async (ctx) => {
console.log('Feedback command received in callback scene, reloading the scene');
await ctx.scene.reenter(); // Reenter the same scene to reset it
});

// Add a start command handler
newOrderScene.command('start', async (ctx) => {
console.log('Callback scene: /start command received, restarting bot');

// Exit the current scene
await ctx.scene.leave();

// Send a restart message
await ctx.reply(ctx.i18n.t('bot_restarted') || 'Bot has been restarted. Starting from the beginning...');

// Go to the start scene (formerly language scene)
return ctx.scene.enter('start');
}); 

