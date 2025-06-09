import { Scenes, Markup } from 'telegraf';
import type { AuthContext } from '../middlewares/auth';
import { requireAuth } from '../middlewares/auth';
import { logger } from '../utils/logger';
import Database from 'better-sqlite3';
import path from 'path';
const { match } = require("telegraf-i18n");

interface Order {
  id: number;
  orderNumber: string;
  orderDate: string;
  orderTime: string;
  status: string;
  phoneNumber: string;
  deliveryType: string;
  deliveryTime: string;
  paymentMethod: string;
  branchName: string;
  totalAmount: number;
  createdAt: string;
  items: OrderItem[];
}

interface OrderItem {
  id: number;
  productId: number;
  name: string;
  price: number;
  quantity: number;
}

export const orderHistoryScene = new Scenes.BaseScene<AuthContext>('order_history');

// Инициализация базы данных
const dbPath = path.join(process.cwd(), 'orders.db');
const db = new Database(dbPath);

orderHistoryScene.enter(requireAuth(), async (ctx) => {
  const userId = ctx.from?.id;
  
  if (!userId) {
    await ctx.reply('Ошибка идентификации пользователя');
    return ctx.scene.enter('mainMenu');
  }

  try {
    logger.userAction(userId, 'view_order_history', 'order_history');
    
    const orders = await getUserOrders(userId);
    
    if (orders.length === 0) {
      const keyboard = Markup.keyboard([
        [ctx.i18n.t('mainKeyboard.startOrder')],
        [ctx.i18n.t('back') || '⬅️ Назад']
      ]).resize();

      await ctx.reply(
        '📖 *История заказов*\n\n' +
        'У вас пока нет заказов.\n' +
        'Сделайте первый заказ прямо сейчас! 🛍️',
        { parse_mode: 'Markdown', ...keyboard }
      );
      return;
    }

    await showOrdersList(ctx, orders);
    
  } catch (error) {
    logger.error('Error in order history scene', error, { userId });
    await ctx.reply('Произошла ошибка при загрузке истории заказов');
    return ctx.scene.enter('mainMenu');
  }
});

// Показать список заказов
async function showOrdersList(ctx: AuthContext, orders: Order[]) {
  const orderButtons = orders.slice(0, 10).map(order => {
    const date = new Date(order.createdAt).toLocaleDateString('ru-RU');
    const status = getStatusEmoji(order.status);
    return [`${status} Заказ #${order.orderNumber} - ${date}`];
  });

  orderButtons.push([ctx.i18n.t('back') || '⬅️ Назад']);

  const keyboard = Markup.keyboard(orderButtons).resize();

  let message = '📖 *История ваших заказов*\n\n';
  
  orders.slice(0, 5).forEach(order => {
    const date = new Date(order.createdAt).toLocaleDateString('ru-RU');
    const time = new Date(order.createdAt).toLocaleTimeString('ru-RU', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    const status = getStatusEmoji(order.status);
    
    message += `${status} *Заказ #${order.orderNumber}*\n`;
    message += `📅 ${date} в ${time}\n`;
    message += `💰 ${order.totalAmount.toLocaleString()} сум\n`;
    message += `📍 ${order.branchName}\n`;
    message += `📋 ${order.status}\n\n`;
  });

  if (orders.length > 5) {
    message += `_И еще ${orders.length - 5} заказов..._\n\n`;
  }

  message += 'Выберите заказ для подробной информации:';

  await ctx.replyWithHTML(message, keyboard);
}

// Показать детали заказа
async function showOrderDetails(ctx: AuthContext, orderNumber: string) {
  const userId = ctx.from?.id;
  
  if (!userId) return;

  try {
    const order = await getOrderByNumber(userId, orderNumber);
    
    if (!order) {
      await ctx.reply('Заказ не найден');
      return;
    }

    const date = new Date(order.createdAt).toLocaleDateString('ru-RU');
    const time = new Date(order.createdAt).toLocaleTimeString('ru-RU', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    const status = getStatusEmoji(order.status);

    let message = `${status} *Заказ #${order.orderNumber}*\n\n`;
    message += `📅 *Дата:* ${date} в ${time}\n`;
    message += `📋 *Статус:* ${order.status}\n`;
    message += `📞 *Телефон:* ${order.phoneNumber}\n`;
    message += `🚚 *Тип доставки:* ${order.deliveryType}\n`;
    message += `⏰ *Время доставки:* ${order.deliveryTime}\n`;
    message += `💳 *Способ оплаты:* ${order.paymentMethod}\n`;
    message += `📍 *Филиал:* ${order.branchName}\n\n`;

    message += `🛍️ *Состав заказа:*\n`;
    order.items.forEach((item, index) => {
      message += `${index + 1}. ${item.name}\n`;
      message += `   ${item.quantity} x ${item.price.toLocaleString()} = ${(item.quantity * item.price).toLocaleString()} сум\n`;
    });

    message += `\n💰 *Итого:* ${order.totalAmount.toLocaleString()} сум`;

    const keyboard = Markup.keyboard([
      ['🔄 Повторить заказ'],
      ['📖 Все заказы', ctx.i18n.t('back') || '⬅️ Назад']
    ]).resize();

    await ctx.replyWithHTML(message, keyboard);
    
    // Сохраняем номер заказа в сессии для возможного повтора
    ctx.session.lastViewedOrder = orderNumber;

  } catch (error) {
    logger.error('Error showing order details', error, { userId, orderNumber });
    await ctx.reply('Ошибка при загрузке деталей заказа');
  }
}

// Обработчики сообщений
orderHistoryScene.hears(/Заказ #(\d+)/, async (ctx) => {
  const match = ctx.message.text.match(/Заказ #(\d+)/);
  if (match) {
    const orderNumber = match[1];
    await showOrderDetails(ctx, orderNumber);
  }
});

orderHistoryScene.hears('🔄 Повторить заказ', async (ctx) => {
  const orderNumber = ctx.session.lastViewedOrder;
  
  if (!orderNumber) {
    await ctx.reply('Выберите заказ для повтора');
    return;
  }

  try {
    const userId = ctx.from?.id;
    if (!userId) return;

    const order = await getOrderByNumber(userId, orderNumber);
    if (!order) {
      await ctx.reply('Заказ не найден');
      return;
    }

    // Очищаем корзину и добавляем товары из заказа
    ctx.session.cart = {
      items: order.items.map(item => ({
        id: item.productId,
        name: item.name,
        price: item.price,
        quantity: item.quantity
      })),
      total: order.totalAmount
    };

    logger.userAction(userId, 'repeat_order', 'order_history', { orderNumber });

    await ctx.reply(
      `✅ Товары из заказа #${orderNumber} добавлены в корзину!\n\n` +
      `Перейдите к оформлению заказа или измените состав.`
    );

    return ctx.scene.enter('newOrder');

  } catch (error) {
    logger.error('Error repeating order', error);
    await ctx.reply('Ошибка при повторе заказа');
  }
});

orderHistoryScene.hears('📖 Все заказы', async (ctx) => {
  return ctx.scene.reenter();
});

orderHistoryScene.hears(match('back'), async (ctx) => {
  return ctx.scene.enter('mainMenu');
});

orderHistoryScene.on('message', async (ctx) => {
  await ctx.reply('Используйте кнопки для навигации');
});

// Вспомогательные функции для работы с базой данных
async function getUserOrders(userId: number): Promise<Order[]> {
  try {
    const ordersQuery = db.prepare(`
      SELECT * FROM orders 
      WHERE userId = ? 
      ORDER BY createdAt DESC 
      LIMIT 50
    `);
    
    const orders = ordersQuery.all(userId) as any[];
    
    // Получаем товары для каждого заказа
    const ordersWithItems = await Promise.all(
      orders.map(async (order) => {
        const itemsQuery = db.prepare(`
          SELECT * FROM order_items 
          WHERE orderId = ?
        `);
        
        const items = itemsQuery.all(order.id) as OrderItem[];
        
        return {
          ...order,
          items
        };
      })
    );

    return ordersWithItems;
    
  } catch (error) {
    logger.error('Error fetching user orders', error, { userId });
    return [];
  }
}

async function getOrderByNumber(userId: number, orderNumber: string): Promise<Order | null> {
  try {
    const orderQuery = db.prepare(`
      SELECT * FROM orders 
      WHERE userId = ? AND orderNumber = ?
    `);
    
    const order = orderQuery.get(userId, orderNumber) as any;
    
    if (!order) return null;

    const itemsQuery = db.prepare(`
      SELECT * FROM order_items 
      WHERE orderId = ?
    `);
    
    const items = itemsQuery.all(order.id) as OrderItem[];
    
    return {
      ...order,
      items
    };
    
  } catch (error) {
    logger.error('Error fetching order by number', error, { userId, orderNumber });
    return null;
  }
}

function getStatusEmoji(status: string): string {
  const statusEmojis: Record<string, string> = {
    'Принят в обработку': '🟡',
    'Готовится': '🟠',
    'Готов': '🟢',
    'Доставляется': '🚚',
    'Выполнен': '✅',
    'Отменен': '❌'
  };

  return statusEmojis[status] || '⚪';
} 