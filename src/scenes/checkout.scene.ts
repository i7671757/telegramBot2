import { Scenes, Markup } from 'telegraf';
import type { AuthContext } from '../middlewares/auth';
import axios from 'axios';
const { match } = require("telegraf-i18n");


const checkoutScene = new Scenes.BaseScene<AuthContext>('checkout');

// Interface for cart items
interface CartItem {
  id: number;
  quantity: number;
}

interface Cart {
  items: CartItem[];
  total: number;
}

// Interface for food items from API
interface FoodItem {
  id: number;
  name: string;
  description: string;
  price: number;
  image: string;
}

// Function to get cart from main cart system
async function getCart(userId: number, ctx?: AuthContext): Promise<{items: Array<{id: number, name: string, price: number, quantity: number}>, total: number} | undefined> {
  try {
    // Import cart functions from categories scene
    const { getOrCreateCart } = await import('./categories.scene');
    const cart = getOrCreateCart(userId, ctx);
    
    if (cart && cart.items.length > 0) {
      console.log(`Checkout: Found cart for user ${userId} with ${cart.items.length} items, total: ${cart.total}`);
      return cart;
    }
    
    console.log(`Checkout: No cart found for user ${userId}`);
    return undefined;
  } catch (error) {
    console.error('Error getting cart in checkout:', error);
    return undefined;
  }
}

// Function to fetch food items from API
async function getFoodItems(): Promise<FoodItem[]> {
  try {
    const categoryId = 7; // Example category
    const response = await axios.get(`${process.env.API_URL}category/${categoryId}/products`);
    
    if (response.data.success) {
      return response.data.data.map((item: any) => ({
        id: item.id,
        name: item.attribute_data.name.chopar.ru || item.custom_name,
        description: item.attribute_data.description?.chopar?.ru || '',
        price: parseFloat(item.price),
        image: item.asset && item.asset.length > 0 && item.asset[0]?.link 
          ? item.asset[0].link 
          : item.image
      }));
    }
    return [];
  } catch (error) {
    console.error('Error fetching food items:', error);
    return [];
  }
}

// Scene entry point
checkoutScene.enter(async (ctx) => {
  console.log('Entering checkout scene');
  
  if (!ctx.from) {
    await ctx.reply('Ошибка: не удалось определить пользователя');
    return ctx.scene.enter('mainMenu');
  }

  const userId = ctx.from.id;
  const cart = await getCart(userId, ctx);

  if (!cart || cart.items.length === 0) {
    await ctx.reply(ctx.i18n.t('checkout.empty_cart'));
    return ctx.scene.enter('categories');
  }

  try {
    // Generate order receipt
    await generateOrderReceipt(ctx, cart);
    
    // Show time selection menu
    await showTimeSelectionMenu(ctx);
    
  } catch (error) {
    console.error('Error in checkout scene:', error);
    await ctx.reply('Произошла ошибка при оформлении заказа. Попробуйте снова.');
    return ctx.scene.enter('newOrder');
  }
});

// Generate and display order receipt
async function generateOrderReceipt(ctx: AuthContext, cart: {items: Array<{id: number, name: string, price: number, quantity: number}>, total: number}) {
  try {
    // Build receipt message
    let receiptMessage = `${ctx.i18n.t('checkout.receipt_title')}\n\n`;
    receiptMessage += `${ctx.i18n.t('checkout.order_composition')}\n`;
    
    let orderTotal = 0;
    
    for (const cartItem of cart.items) {
      const itemTotal = cartItem.price * cartItem.quantity;
      orderTotal += itemTotal;
      
      const formattedItemPrice = new Intl.NumberFormat('ru-RU').format(cartItem.price);
      const formattedItemTotal = new Intl.NumberFormat('ru-RU').format(itemTotal);
      
      receiptMessage += `• ${cartItem.quantity} × ${cartItem.name}\n`;
      receiptMessage += `  ${formattedItemPrice} ${ctx.i18n.t('checkout.sum')} × ${cartItem.quantity} = ${formattedItemTotal} ${ctx.i18n.t('checkout.sum')}\n\n`;
    }
    
    // Add total
    const formattedTotal = new Intl.NumberFormat('ru-RU').format(orderTotal);
    receiptMessage += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    receiptMessage += `${ctx.i18n.t('checkout.total_to_pay')} <b>${formattedTotal} ${ctx.i18n.t('checkout.sum')}</b>\n`;
    receiptMessage += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    
    // Add order details
    const orderDate = new Date().toLocaleDateString('ru-RU');
    const orderTime = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    
    receiptMessage += `${ctx.i18n.t('checkout.order_date')} ${orderDate}\n`;
    receiptMessage += `${ctx.i18n.t('checkout.order_time')} ${orderTime}\n`;
    receiptMessage += `${ctx.i18n.t('checkout.customer')} ${ctx.from?.first_name || ctx.i18n.t('not_specified')}\n\n`;
    
    // Send receipt
    await ctx.replyWithHTML(receiptMessage);
    
  } catch (error) {
    console.error('Error generating receipt:', error);
    await ctx.reply(ctx.i18n.t('checkout.error_creating_receipt'));
  }
}

// Show time selection menu
async function showTimeSelectionMenu(ctx: AuthContext) {
  const timeMessage = ctx.i18n.t('checkout.time_selection');
  
  const timeKeyboard = Markup.keyboard([
    [ctx.i18n.t('checkout.specific_time'), ctx.i18n.t('checkout.nearest_time')],
    [ctx.i18n.t('back')]
  ]).resize();
  
  await ctx.replyWithHTML(timeMessage, timeKeyboard);
}

// Show payment method selection menu
async function showPaymentMethodSelection(ctx: AuthContext) {
  console.log('Showing payment method selection menu');
  const paymentMessage = ctx.i18n.t('checkout.payment_selection');
  
  const paymentKeyboard = Markup.keyboard([
    [ctx.i18n.t('checkout.payment_cash'), ctx.i18n.t('checkout.payment_click')],
    [ctx.i18n.t('checkout.payment_payme')],
    [ctx.i18n.t('back')]
  ]).resize();
  
  console.log('Payment keyboard created with buttons:', paymentKeyboard.reply_markup.keyboard);
  await ctx.replyWithHTML(paymentMessage, paymentKeyboard);
  console.log('Payment method selection menu sent');
}

// Function to generate available time slots
function generateTimeSlots(): string[] {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const timeSlots: string[] = [];
  
  // Generate time slots from 10:00 to 03:00 (next day)
  // 10:20-10:40, 11:20-11:40, etc.
  
  // Today's slots (10:00 to 23:59)
  for (let hour = 10; hour <= 23; hour++) {
    const startTime = `${hour.toString().padStart(2, '0')}:20`;
    const endTime = `${hour.toString().padStart(2, '0')}:40`;
    const timeSlot = `${startTime}-${endTime}`;
    
    // Check if this time slot is in the future
    if (hour > currentHour || (hour === currentHour && 20 > currentMinute)) {
      timeSlots.push(timeSlot);
    }
  }
  
  // Tomorrow's slots (00:00 to 03:00)
  for (let hour = 0; hour <= 2; hour++) {
    const startTime = `${hour.toString().padStart(2, '0')}:20`;
    const endTime = `${hour.toString().padStart(2, '0')}:40`;
    const timeSlot = `${startTime}-${endTime}`;
    timeSlots.push(timeSlot);
  }
  
  return timeSlots;
}

// Handle "На время" button
checkoutScene.hears(match('checkout.specific_time'), async (ctx) => {
  const timeSlots = generateTimeSlots();
  
  if (timeSlots.length === 0) {
    await ctx.reply(
      ctx.i18n.t('checkout.time_slots_busy'),
      Markup.keyboard([
        [ctx.i18n.t('checkout.nearest_time')],
        [ctx.i18n.t('back')]
      ]).resize()
    );
    return;
  }
  
  // Create keyboard with time buttons (2 buttons per row)
  const timeButtons: string[][] = [];
  for (let i = 0; i < timeSlots.length; i += 2) {
    const row = timeSlots.slice(i, i + 2);
    timeButtons.push(row);
  }
  
  // Add back button
  timeButtons.push([ctx.i18n.t('back')]);
  
  const keyboard = Markup.keyboard(timeButtons).resize();
  
  await ctx.reply(
    ctx.i18n.t('checkout.time_selection'),
    keyboard
  );
  
  // Set flag to expect time slot selection
  ctx.session.expectingTimeSlotSelection = true;
});

// Handle "Ближайшее время" button
checkoutScene.hears(match('checkout.nearest_time'), async (ctx) => {
  await ctx.reply(ctx.i18n.t('checkout.time_set_nearest'));
  
  // Save selected time and show payment method selection
  (ctx.session as any).selectedPickupTime = ctx.i18n.t('checkout.nearest_time');
  await showPaymentMethodSelection(ctx);
});

// Handle back button from time selection
checkoutScene.hears(match('back'), async (ctx) => {
  await ctx.reply(ctx.i18n.t('checkout.returning_to_cart'));
  return ctx.scene.enter('newOrder');
});

// Handle back to time selection
checkoutScene.hears(match('checkout.back_to_time_selection'), async (ctx) => {
  ctx.session.expectingTimeInput = false;
  await showTimeSelectionMenu(ctx);
});

// Handle payment method selection
checkoutScene.hears(match('checkout.payment_cash'), async (ctx) => {
  console.log('Payment method selected: Наличка');
  await ctx.reply(ctx.i18n.t('checkout.payment_selected_cash'));
  
  // Ask for additional phone number
  await ctx.reply(ctx.i18n.t('checkout.additional_phone_request'));
  
  // Show keyboard with Back and Skip buttons
  const keyboard = Markup.keyboard([
    [ctx.i18n.t('back'), ctx.i18n.t('checkout.skip')]
  ]).resize();
  
  await ctx.reply(ctx.i18n.t('checkout.choose_action'), keyboard);
  
  // Save payment method and set flag for expecting phone number
  if (!ctx.session) ctx.session = {} as any;
  (ctx.session as any).selectedPaymentMethod = ctx.i18n.t('checkout.payment_cash');
  ctx.session.expectingAdditionalPhone = true;
});

checkoutScene.hears(match('checkout.payment_click'), async (ctx) => {
  console.log('Payment method selected: Click');
  await ctx.reply(ctx.i18n.t('checkout.payment_selected_click'));
  
  // Ask for additional phone number
  await ctx.reply(ctx.i18n.t('checkout.additional_phone_request'));
  
  // Show keyboard with Back and Skip buttons
  const keyboard = Markup.keyboard([
    [ctx.i18n.t('back'), ctx.i18n.t('checkout.skip')]
  ]).resize();
  
  await ctx.reply(ctx.i18n.t('checkout.choose_action'), keyboard);
  
  // Save payment method and set flag for expecting phone number
  if (!ctx.session) ctx.session = {} as any;
  (ctx.session as any).selectedPaymentMethod = ctx.i18n.t('checkout.payment_click');
  ctx.session.expectingAdditionalPhone = true;
});

checkoutScene.hears(match('checkout.payment_payme'), async (ctx) => {
  console.log('Payment method selected: Payme');
  await ctx.reply(ctx.i18n.t('checkout.payment_selected_payme'));
  
  // Ask for additional phone number
  await ctx.reply(ctx.i18n.t('checkout.additional_phone_request'));
  
  // Show keyboard with Back and Skip buttons
  const keyboard = Markup.keyboard([
    [ctx.i18n.t('back'), ctx.i18n.t('checkout.skip')]
  ]).resize();
  
  await ctx.reply(ctx.i18n.t('checkout.choose_action'), keyboard);
  
  // Save payment method and set flag for expecting phone number
  if (!ctx.session) ctx.session = {} as any;
  (ctx.session as any).selectedPaymentMethod = ctx.i18n.t('checkout.payment_payme');
  ctx.session.expectingAdditionalPhone = true;
});

// Handle "Пропустить" button
checkoutScene.hears(match('checkout.skip'), async (ctx) => {
  if (ctx.session.expectingAdditionalPhone) {
    console.log('User skipped additional phone number');
    ctx.session.expectingAdditionalPhone = false;
    ctx.session.additionalPhone = 'не указан';
    
    // Ask about cutlery
    await askAboutCutlery(ctx);
  }
});

// Function to ask about cutlery and napkins
async function askAboutCutlery(ctx: AuthContext) {
  console.log('askAboutCutlery function called');
  const cutleryMessage = ctx.i18n.t('checkout.cutlery_question');
  
  const cutleryKeyboard = Markup.keyboard([
    [ctx.i18n.t('checkout.yes'), ctx.i18n.t('checkout.no')]
  ]).resize();
  
  console.log('Sending cutlery question with keyboard');
  await ctx.reply(cutleryMessage, cutleryKeyboard);
  ctx.session.expectingCutleryChoice = true;
  console.log('Set expectingCutleryChoice to true');
}

// Handle "Да" button for cutlery
checkoutScene.hears(match('checkout.yes'), async (ctx) => {
  if (ctx.session.expectingCutleryChoice) {
    console.log('User wants cutlery and napkins');
    ctx.session.expectingCutleryChoice = false;
    ctx.session.includeCutlery = true;
    
    // Show order confirmation buttons
    await showOrderConfirmation(ctx);
  }
});

// Handle "Нет" button for cutlery
checkoutScene.hears(match('checkout.no'), async (ctx) => {
  if (ctx.session.expectingCutleryChoice) {
    console.log('User does not want cutlery and napkins');
    ctx.session.expectingCutleryChoice = false;
    ctx.session.includeCutlery = false;
    
    // Show order confirmation buttons
    await showOrderConfirmation(ctx);
  }
});

// Function to show order confirmation
async function showOrderConfirmation(ctx: AuthContext) {
  console.log('showOrderConfirmation function called');
  
  const confirmationKeyboard = Markup.keyboard([
    [ctx.i18n.t('checkout.cancel_order'), ctx.i18n.t('checkout.confirm_order')]
  ]).resize();
  
  await ctx.reply(ctx.i18n.t('checkout.confirm_order_message'), confirmationKeyboard);
  ctx.session.expectingOrderConfirmation = true;
  console.log('Set expectingOrderConfirmation to true');
}

// Handle "Отменить заказ" button
checkoutScene.hears(match('checkout.cancel_order'), async (ctx) => {
  if (ctx.session.expectingOrderConfirmation) {
    console.log('User cancelled the order');
    ctx.session.expectingOrderConfirmation = false;
    
    // Clear all order data
    ctx.session.expectingAdditionalPhone = false;
    ctx.session.expectingCutleryChoice = false;
    ctx.session.additionalPhone = undefined;
    ctx.session.includeCutlery = undefined;
    (ctx.session as any).selectedPaymentMethod = undefined;
    (ctx.session as any).selectedPickupTime = undefined;
    
    await ctx.reply(ctx.i18n.t('checkout.order_cancelled'));
    
    // Return to main menu
    return ctx.scene.enter('mainMenu');
  }
});

// Handle "Подтвердить" button
checkoutScene.hears(match('checkout.confirm_order'), async (ctx) => {
  if (ctx.session.expectingOrderConfirmation) {
    console.log('User confirmed the order');
    ctx.session.expectingOrderConfirmation = false;
    
    // Generate and show detailed order information
    await showDetailedOrder(ctx);
    
    // Return to main menu after showing order details
    return ctx.scene.enter('mainMenu');
  }
});

// Function to generate detailed order information
async function showDetailedOrder(ctx: AuthContext) {
  try {
    console.log('Generating detailed order information');
    
    // Generate order number (random 4-digit number)
    const orderNumber = Math.floor(1000 + Math.random() * 9000);
    
    // Get current date and time
    const now = new Date();
    const orderDate = now.toLocaleDateString('ru-RU', { 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    });
    const orderTime = now.toLocaleTimeString('ru-RU', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    // Get order details - исправляем логику определения номера телефона
    let phoneNumber = ctx.i18n.t('not_specified');
    if (ctx.session.additionalPhone && ctx.session.additionalPhone !== ctx.i18n.t('not_specified')) {
      phoneNumber = ctx.session.additionalPhone;
    } else if (ctx.session.phone) {
      phoneNumber = ctx.session.phone;
    }
    
    const pickupTime = (ctx.session as any).selectedPickupTime || ctx.i18n.t('checkout.nearest_time');
    const paymentMethod = (ctx.session as any).selectedPaymentMethod || ctx.i18n.t('not_specified');
    
    // Determine delivery type based on user's choice in startOrder scene
    // Check if user selected delivery or pickup
    let deliveryType = ctx.i18n.t('checkout.pickup_type'); // Default to pickup
    let branchName = ctx.i18n.t('checkout.branch'); // Default branch
    
    // Get delivery type from session
    const selectedDeliveryType = (ctx.session as any).deliveryType;
    if (selectedDeliveryType === 'delivery') {
      deliveryType = ctx.i18n.t('checkout.delivery_type');
    } else if (selectedDeliveryType === 'pickup') {
      deliveryType = ctx.i18n.t('checkout.pickup_type');
    }
    
    // Get branch information if available
    if (ctx.session.selectedBranch) {
      try {
        // Import terminal utilities to get branch info by ID
        const { fetchTerminals, getTerminalName } = await import('../utils/cities');
        const allTerminals = await fetchTerminals();
        const selectedTerminal = allTerminals.find(t => t.id === ctx.session.selectedBranch);
        
        if (selectedTerminal) {
          // Get current language for proper terminal name
          const language = ctx.i18n.locale();
          branchName = getTerminalName(selectedTerminal, language);
          console.log(`Found selected branch: ${branchName} (ID: ${selectedTerminal.id})`);
        } else {
          console.log(`Branch with ID ${ctx.session.selectedBranch} not found`);
        }
      } catch (error) {
        console.error('Error fetching branch information:', error);
      }

    }
    
    // Get cart information
    const userId = ctx.from?.id;
    let cart;
    if (userId) {
      const { getOrCreateCart } = await import('./categories.scene');
      cart = getOrCreateCart(userId, ctx);
    }
    
    // Build detailed order message
    let orderMessage = `${ctx.i18n.t('checkout.order_confirmed')}\n`;
    orderMessage += `${ctx.i18n.t('checkout.order_number')} ${orderNumber}\n`;
    orderMessage += `${ctx.i18n.t('checkout.order_date')} ${orderDate} ${orderTime}\n`;
    orderMessage += `${ctx.i18n.t('checkout.order_status')} ${ctx.i18n.t('checkout.order_status_accepted')}\n`;
    orderMessage += `${ctx.i18n.t('checkout.phone_label')} ${phoneNumber}\n`;
    orderMessage += `${ctx.i18n.t('checkout.delivery_type')} ${deliveryType}\n`;
    
    // Format delivery time properly
    let formattedDeliveryTime = pickupTime;
    if (pickupTime === ctx.i18n.t('checkout.nearest_time')) {
      formattedDeliveryTime = ctx.i18n.t('checkout.nearest_time');
    }
    orderMessage += `${ctx.i18n.t('checkout.delivery_time')} ${formattedDeliveryTime}\n`;
    
    orderMessage += `${ctx.i18n.t('checkout.payment_method')} ${getPaymentMethodIcon(ctx, paymentMethod)} ${paymentMethod}\n`;
    orderMessage += `${ctx.i18n.t('checkout.branch')} ${branchName}\n\n`;
    
    // Add cart items
    let totalAmount = 0;
    let itemCounter = 1;
    
    if (cart && cart.items && cart.items.length > 0) {
      console.log(`Processing ${cart.items.length} items from cart`);
      for (const item of cart.items) {
        const itemTotal = item.price * item.quantity;
        totalAmount += itemTotal;
        
        const formattedPrice = new Intl.NumberFormat('ru-RU').format(item.price);
        const formattedTotal = new Intl.NumberFormat('ru-RU').format(itemTotal);
        
        orderMessage += `${itemCounter}. ${item.name}\n`;
        orderMessage += `${item.quantity} x ${formattedPrice} = ${formattedTotal} ${ctx.i18n.t('checkout.sum')}\n\n`;
        itemCounter++;
      }
    } else {
      console.log('No cart items found, this should not happen in normal flow');
      // This should not happen in normal flow, but keeping as fallback
      orderMessage += `1. Товар не найден\n1 x 0 = 0 ${ctx.i18n.t('checkout.sum')}\n\n`;
      totalAmount = 0;
    }
    
    // Add total
    const formattedTotal = new Intl.NumberFormat('ru-RU').format(totalAmount);
    orderMessage += `${ctx.i18n.t('checkout.total')} ${formattedTotal} ${ctx.i18n.t('checkout.sum')}\n\n`;
    
    // Add delivery note only if it's delivery type
    if (deliveryType.includes('Доставка')) {
      orderMessage += `${ctx.i18n.t('checkout.delivery_note')}`;
    }
    
    console.log('Order message template:', orderMessage);
    
    await ctx.reply(orderMessage);
    
    // Clear the cart after successful order
    if (userId) {
      const { userCarts, syncCartToSession } = await import('./categories.scene');
      userCarts.set(userId, { items: [], total: 0 });
      syncCartToSession(userId, ctx);
    }
    
    console.log(`Detailed order shown: Order #${orderNumber}, Total: ${formattedTotal} ${ctx.i18n.t('checkout.sum')}, Delivery: ${deliveryType}, Branch: ${branchName}`);
    
  } catch (error) {
    console.error('Error generating detailed order:', error);
    await ctx.reply(ctx.i18n.t('checkout.error_creating_order'));
  }
}

// Helper function to get payment method icon
function getPaymentMethodIcon(ctx: AuthContext, paymentMethod: string): string {
  switch (paymentMethod) {
    case ctx.i18n.t('checkout.payment_cash'):
      return '';
    case ctx.i18n.t('checkout.payment_click'):
      return '';
    case ctx.i18n.t('checkout.payment_payme'):
      return '';
    default:
      return '';
  }
}

// Handle time slot selection
checkoutScene.on('text', async (ctx) => {
  const messageText = ctx.message.text;
  console.log(`Checkout scene received text: "${messageText}"`);
  
  // Check if we're expecting an additional phone number
  if (ctx.session.expectingAdditionalPhone === true) {
    console.log('Expecting additional phone number');
    
    // More flexible phone number validation - accepts various formats
    // +998909909090, +998 90 909 90 90, +998 99 999 99 99, etc.
    const phoneRegex = /^\+998\s*\d{2}\s*\d{3}\s*\d{2}\s*\d{2}$|^\+998\s*\d{2}\s*\d{3}\s*\d{4}$/;
    
    console.log(`Testing phone number "${messageText}" against regex`);
    
    if (phoneRegex.test(messageText)) {
      console.log(`Valid additional phone number received: ${messageText}`);
      ctx.session.expectingAdditionalPhone = false;
      
      // Save additional phone number
      ctx.session.additionalPhone = messageText;
      await ctx.reply(ctx.i18n.t('checkout.additional_phone_saved', { phone: messageText }));
      
      // Ask about cutlery
      console.log('Proceeding to ask about cutlery');
      await askAboutCutlery(ctx);
      return;
    } else {
      console.log(`Invalid phone number format: ${messageText}`);
      await ctx.reply(ctx.i18n.t('changeNumber.invalid_format'));
      return;
    }
  }
  
  // Check if we're expecting time slot selection
  if (ctx.session.expectingTimeSlotSelection) {
    console.log('Expecting time slot selection');
    // Check if it's a valid time slot format (XX:XX-XX:XX)
    const timeSlotRegex = /^([0-2][0-9]):([0-5][0-9])-([0-2][0-9]):([0-5][0-9])$/;
    
    if (timeSlotRegex.test(messageText)) {
      console.log(`Valid time slot selected: ${messageText}`);
      ctx.session.expectingTimeSlotSelection = false;
      await ctx.reply(`${ctx.i18n.t('checkout.time_of_order')} ${messageText}`);
      
      // Save selected time and show payment method selection
      (ctx.session as any).selectedPickupTime = messageText;
      await showPaymentMethodSelection(ctx);
      return;
    }
  }
  
  console.log('Unhandled text message in checkout scene:', messageText);
  // Handle other text messages
  await ctx.reply(
    ctx.i18n.t('checkout.use_buttons'),
    Markup.keyboard([
      [ctx.i18n.t('checkout.specific_time'), ctx.i18n.t('checkout.nearest_time')],
      [ctx.i18n.t('back')]
    ]).resize()
  );
});

// Complete the order
async function completeOrder(ctx: AuthContext, pickupTime: string, paymentMethod?: string) {
  try {
    // Clear the cart
    if (ctx.from) {
      const userId = ctx.from.id;
      
      // Import cart functions from categories scene and clear cart
      const { userCarts, syncCartToSession } = await import('./categories.scene');
      userCarts.set(userId, { items: [], total: 0 });
      
      // Sync cleared cart to session
      syncCartToSession(userId, ctx);
    }
    
    // Get additional phone number if available
    const additionalPhone = ctx.session.additionalPhone;
    const cutleryStatus = ctx.session.includeCutlery ? ctx.i18n.t('checkout.yes') : ctx.i18n.t('checkout.no');
    
    // Log order completion
    console.log(`Order completed: User: ${ctx.from?.id}, Time: ${pickupTime}, Payment: ${paymentMethod}, Additional Phone: ${additionalPhone}, Cutlery: ${cutleryStatus}`);
    
    // Confirmation message
    let confirmationMessage = `✅ Заказ оформлен!\n\n`;
    confirmationMessage += `🕐 Время получения: ${pickupTime}\n`;
    if (paymentMethod) {
      confirmationMessage += `💳 Способ оплаты: ${paymentMethod}\n`;
    }
    confirmationMessage += `📱 Дополнительный номер: ${additionalPhone}\n`;
    confirmationMessage += `🍴 Приборы и салфетки: ${cutleryStatus}\n`;
    confirmationMessage += `\nСпасибо за ваш заказ! 🎉`;
    
    await ctx.reply(confirmationMessage);
    
    // Return to main menu
    return ctx.scene.enter('mainMenu');
    
  } catch (error) {
    console.error('Error completing order:', error);
    await ctx.reply(ctx.i18n.t('checkout.error_completing_order'));
  }
}

// Handle start command
checkoutScene.command('start', async (ctx) => {
  console.log('Checkout scene: /start command received, restarting bot');
  await ctx.scene.leave();
  await ctx.reply(ctx.i18n.t('bot_restarted'));
  return ctx.scene.enter('start');
});

export { checkoutScene }; 