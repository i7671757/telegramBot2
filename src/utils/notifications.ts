import { Telegraf } from 'telegraf';
import { logger } from './logger';
import Database from 'better-sqlite3';
import path from 'path';

interface NotificationTemplate {
  title: string;
  message: string;
  emoji: string;
}

interface OrderStatusUpdate {
  orderId: number;
  orderNumber: string;
  userId: number;
  newStatus: string;
  estimatedTime?: string;
  additionalInfo?: string;
}

export class NotificationService {
  private bot: Telegraf;
  private db: Database.Database;
  private templates: Record<string, NotificationTemplate>;

  constructor(bot: Telegraf) {
    this.bot = bot;
    this.db = new Database(path.join(process.cwd(), 'orders.db'));
    this.templates = this.initializeTemplates();
  }

  private initializeTemplates(): Record<string, NotificationTemplate> {
    return {
      'order_confirmed': {
        title: 'Заказ принят',
        message: 'Ваш заказ #{orderNumber} принят в обработку!',
        emoji: '✅'
      },
      'order_preparing': {
        title: 'Заказ готовится',
        message: 'Ваш заказ #{orderNumber} готовится. Примерное время: {estimatedTime}',
        emoji: '👨‍🍳'
      },
      'order_ready': {
        title: 'Заказ готов',
        message: 'Ваш заказ #{orderNumber} готов! Можете забирать.',
        emoji: '🎉'
      },
      'order_delivering': {
        title: 'Заказ в пути',
        message: 'Ваш заказ #{orderNumber} передан курьеру. Ожидайте доставку!',
        emoji: '🚚'
      },
      'order_delivered': {
        title: 'Заказ доставлен',
        message: 'Ваш заказ #{orderNumber} успешно доставлен! Спасибо за покупку!',
        emoji: '✅'
      },
      'order_cancelled': {
        title: 'Заказ отменен',
        message: 'К сожалению, ваш заказ #{orderNumber} был отменен. {additionalInfo}',
        emoji: '❌'
      },
      'promotion': {
        title: 'Специальное предложение',
        message: 'У нас новая акция! {additionalInfo}',
        emoji: '🔥'
      },
      'reminder': {
        title: 'Напоминание',
        message: 'Не забудьте забрать ваш заказ #{orderNumber}!',
        emoji: '⏰'
      }
    };
  }

  /**
   * Отправка уведомления о статусе заказа
   */
  async sendOrderStatusUpdate(update: OrderStatusUpdate): Promise<boolean> {
    try {
      const template = this.getTemplateByStatus(update.newStatus);
      
      if (!template) {
        logger.warn(`No template found for status: ${update.newStatus}`);
        return false;
      }

      const message = this.formatMessage(template, update);
      
      await this.bot.telegram.sendMessage(
        update.userId,
        `${template.emoji} *${template.title}*\n\n${message}`,
        { parse_mode: 'Markdown' }
      );

      // Обновляем статус в базе данных
      await this.updateOrderStatus(update.orderId, update.newStatus);

      logger.info('Order status notification sent', {
        userId: update.userId,
        orderNumber: update.orderNumber,
        status: update.newStatus
      });

      return true;

    } catch (error) {
      logger.error('Failed to send order status notification', error, {
        userId: update.userId,
        orderNumber: update.orderNumber
      });
      return false;
    }
  }

  /**
   * Массовая отправка уведомлений
   */
  async sendBulkNotification(
    userIds: number[], 
    templateKey: string, 
    data: Record<string, string>
  ): Promise<{ sent: number; failed: number }> {
    const template = this.templates[templateKey];
    
    if (!template) {
      logger.error(`Template not found: ${templateKey}`);
      return { sent: 0, failed: userIds.length };
    }

    let sent = 0;
    let failed = 0;

    for (const userId of userIds) {
      try {
        const message = this.formatMessage(template, data);
        
        await this.bot.telegram.sendMessage(
          userId,
          `${template.emoji} *${template.title}*\n\n${message}`,
          { parse_mode: 'Markdown' }
        );

        sent++;
        
        // Небольшая задержка между отправками
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        logger.error('Failed to send bulk notification', error, { userId });
        failed++;
      }
    }

    logger.info('Bulk notification completed', { 
      templateKey, 
      sent, 
      failed, 
      total: userIds.length 
    });

    return { sent, failed };
  }

  /**
   * Отправка напоминания о заказе
   */
  async sendOrderReminder(orderNumber: string, userId: number): Promise<boolean> {
    try {
      const template = this.templates['reminder'];
      const message = template.message.replace('{orderNumber}', orderNumber);

      await this.bot.telegram.sendMessage(
        userId,
        `${template.emoji} *${template.title}*\n\n${message}`,
        { parse_mode: 'Markdown' }
      );

      logger.info('Order reminder sent', { userId, orderNumber });
      return true;

    } catch (error) {
      logger.error('Failed to send order reminder', error, { userId, orderNumber });
      return false;
    }
  }

  /**
   * Отправка промо-уведомления
   */
  async sendPromotion(
    userIds: number[], 
    promoText: string, 
    imageUrl?: string
  ): Promise<{ sent: number; failed: number }> {
    const template = this.templates['promotion'];
    let sent = 0;
    let failed = 0;

    for (const userId of userIds) {
      try {
        const message = template.message.replace('{additionalInfo}', promoText);

        if (imageUrl) {
          await this.bot.telegram.sendPhoto(
            userId,
            imageUrl,
            {
              caption: `${template.emoji} *${template.title}*\n\n${message}`,
              parse_mode: 'Markdown'
            }
          );
        } else {
          await this.bot.telegram.sendMessage(
            userId,
            `${template.emoji} *${template.title}*\n\n${message}`,
            { parse_mode: 'Markdown' }
          );
        }

        sent++;
        await new Promise(resolve => setTimeout(resolve, 150));

      } catch (error) {
        logger.error('Failed to send promotion', error, { userId });
        failed++;
      }
    }

    return { sent, failed };
  }

  /**
   * Получение всех пользователей для рассылки
   */
  async getAllUserIds(): Promise<number[]> {
    try {
      const query = this.db.prepare('SELECT DISTINCT userId FROM orders');
      const users = query.all() as { userId: number }[];
      return users.map(user => user.userId);
    } catch (error) {
      logger.error('Failed to get user IDs', error);
      return [];
    }
  }

  /**
   * Получение пользователей по городу
   */
  async getUserIdsByCity(cityId: number): Promise<number[]> {
    // Здесь нужно будет добавить логику получения пользователей по городу
    // Пока возвращаем всех пользователей
    return this.getAllUserIds();
  }

  private getTemplateByStatus(status: string): NotificationTemplate | null {
    const statusMap: Record<string, string> = {
      'Принят в обработку': 'order_confirmed',
      'Готовится': 'order_preparing',
      'Готов': 'order_ready',
      'Доставляется': 'order_delivering',
      'Выполнен': 'order_delivered',
      'Отменен': 'order_cancelled'
    };

    const templateKey = statusMap[status];
    return templateKey ? this.templates[templateKey] : null;
  }

  private formatMessage(template: NotificationTemplate, data: any): string {
    let message = template.message;

    // Заменяем плейсхолдеры
    Object.keys(data).forEach(key => {
      const placeholder = `{${key}}`;
      if (message.includes(placeholder)) {
        message = message.replace(new RegExp(placeholder, 'g'), data[key] || '');
      }
    });

    return message;
  }

  private async updateOrderStatus(orderId: number, newStatus: string): Promise<void> {
    try {
      const query = this.db.prepare(`
        UPDATE orders 
        SET status = ?, updatedAt = CURRENT_TIMESTAMP 
        WHERE id = ?
      `);
      
      query.run(newStatus, orderId);
      
    } catch (error) {
      logger.error('Failed to update order status', error, { orderId, newStatus });
    }
  }

  /**
   * Планировщик напоминаний
   */
  startReminderScheduler(): void {
    // Проверяем каждые 30 минут
    setInterval(async () => {
      await this.checkPendingReminders();
    }, 30 * 60 * 1000);

    logger.info('Reminder scheduler started');
  }

  private async checkPendingReminders(): Promise<void> {
    try {
      // Находим заказы, которые готовы более 30 минут назад
      const query = this.db.prepare(`
        SELECT orderNumber, userId 
        FROM orders 
        WHERE status = 'Готов' 
        AND datetime(updatedAt, '+30 minutes') < datetime('now')
        AND datetime(updatedAt, '+2 hours') > datetime('now')
      `);

      const pendingOrders = query.all() as { orderNumber: string; userId: number }[];

      for (const order of pendingOrders) {
        await this.sendOrderReminder(order.orderNumber, order.userId);
      }

      if (pendingOrders.length > 0) {
        logger.info(`Sent ${pendingOrders.length} order reminders`);
      }

    } catch (error) {
      logger.error('Error checking pending reminders', error);
    }
  }
}

// Экспортируем функцию для создания сервиса
export function createNotificationService(bot: Telegraf): NotificationService {
  return new NotificationService(bot);
} 