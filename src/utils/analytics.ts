import { logger } from './logger';
import Database from 'better-sqlite3';
import path from 'path';

interface UserEvent {
  userId: number;
  event: string;
  scene?: string;
  data?: any;
  timestamp: string;
}

interface AnalyticsMetrics {
  totalUsers: number;
  activeUsers: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  orders: {
    total: number;
    completed: number;
    cancelled: number;
    averageValue: number;
  };
  popularProducts: Array<{
    productId: number;
    name: string;
    orderCount: number;
  }>;
  sceneUsage: Record<string, number>;
  errorRate: number;
  conversionRate: number;
}

export class AnalyticsService {
  private db: Database.Database;

  constructor() {
    this.db = new Database(path.join(process.cwd(), 'orders.db'));
    this.initializeTables();
  }

  private initializeTables(): void {
    try {
      // Таблица для событий пользователей
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS user_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          userId INTEGER NOT NULL,
          event TEXT NOT NULL,
          scene TEXT,
          data TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Индексы для быстрого поиска
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_user_events_user_id ON user_events(userId);
        CREATE INDEX IF NOT EXISTS idx_user_events_event ON user_events(event);
        CREATE INDEX IF NOT EXISTS idx_user_events_timestamp ON user_events(timestamp);
      `);

      logger.info('Analytics tables initialized');
    } catch (error) {
      logger.error('Failed to initialize analytics tables', error);
    }
  }

  /**
   * Запись события пользователя
   */
  trackEvent(userId: number, event: string, scene?: string, data?: any): void {
    try {
      const query = this.db.prepare(`
        INSERT INTO user_events (userId, event, scene, data)
        VALUES (?, ?, ?, ?)
      `);

      query.run(userId, event, scene, data ? JSON.stringify(data) : null);

      logger.debug('Event tracked', { userId, event, scene });
    } catch (error) {
      logger.error('Failed to track event', error, { userId, event });
    }
  }

  /**
   * Получение общих метрик
   */
  async getMetrics(days: number = 30): Promise<AnalyticsMetrics> {
    try {
      const metrics: AnalyticsMetrics = {
        totalUsers: await this.getTotalUsers(),
        activeUsers: await this.getActiveUsers(),
        orders: await this.getOrderMetrics(days),
        popularProducts: await this.getPopularProducts(days),
        sceneUsage: await this.getSceneUsage(days),
        errorRate: await this.getErrorRate(days),
        conversionRate: await this.getConversionRate(days)
      };

      return metrics;
    } catch (error) {
      logger.error('Failed to get analytics metrics', error);
      throw error;
    }
  }

  /**
   * Получение общего количества пользователей
   */
  private async getTotalUsers(): Promise<number> {
    const query = this.db.prepare('SELECT COUNT(DISTINCT userId) as count FROM user_events');
    const result = query.get() as { count: number };
    return result.count;
  }

  /**
   * Получение активных пользователей
   */
  private async getActiveUsers(): Promise<{ daily: number; weekly: number; monthly: number }> {
    const dailyQuery = this.db.prepare(`
      SELECT COUNT(DISTINCT userId) as count 
      FROM user_events 
      WHERE date(timestamp) = date('now')
    `);

    const weeklyQuery = this.db.prepare(`
      SELECT COUNT(DISTINCT userId) as count 
      FROM user_events 
      WHERE date(timestamp) >= date('now', '-7 days')
    `);

    const monthlyQuery = this.db.prepare(`
      SELECT COUNT(DISTINCT userId) as count 
      FROM user_events 
      WHERE date(timestamp) >= date('now', '-30 days')
    `);

    const daily = (dailyQuery.get() as { count: number }).count;
    const weekly = (weeklyQuery.get() as { count: number }).count;
    const monthly = (monthlyQuery.get() as { count: number }).count;

    return { daily, weekly, monthly };
  }

  /**
   * Получение метрик заказов
   */
  private async getOrderMetrics(days: number): Promise<{
    total: number;
    completed: number;
    cancelled: number;
    averageValue: number;
  }> {
    const totalQuery = this.db.prepare(`
      SELECT COUNT(*) as count 
      FROM orders 
      WHERE date(createdAt) >= date('now', '-${days} days')
    `);

    const completedQuery = this.db.prepare(`
      SELECT COUNT(*) as count 
      FROM orders 
      WHERE status = 'Выполнен' 
      AND date(createdAt) >= date('now', '-${days} days')
    `);

    const cancelledQuery = this.db.prepare(`
      SELECT COUNT(*) as count 
      FROM orders 
      WHERE status = 'Отменен' 
      AND date(createdAt) >= date('now', '-${days} days')
    `);

    const avgValueQuery = this.db.prepare(`
      SELECT AVG(totalAmount) as avg 
      FROM orders 
      WHERE date(createdAt) >= date('now', '-${days} days')
    `);

    const total = (totalQuery.get() as { count: number }).count;
    const completed = (completedQuery.get() as { count: number }).count;
    const cancelled = (cancelledQuery.get() as { count: number }).count;
    const averageValue = (avgValueQuery.get() as { avg: number }).avg || 0;

    return { total, completed, cancelled, averageValue };
  }

  /**
   * Получение популярных продуктов
   */
  private async getPopularProducts(days: number): Promise<Array<{
    productId: number;
    name: string;
    orderCount: number;
  }>> {
    const query = this.db.prepare(`
      SELECT 
        oi.productId,
        oi.name,
        COUNT(*) as orderCount
      FROM order_items oi
      JOIN orders o ON oi.orderId = o.id
      WHERE date(o.createdAt) >= date('now', '-${days} days')
      GROUP BY oi.productId, oi.name
      ORDER BY orderCount DESC
      LIMIT 10
    `);

    return query.all() as Array<{
      productId: number;
      name: string;
      orderCount: number;
    }>;
  }

  /**
   * Получение статистики использования сцен
   */
  private async getSceneUsage(days: number): Promise<Record<string, number>> {
    const query = this.db.prepare(`
      SELECT scene, COUNT(*) as count
      FROM user_events
      WHERE scene IS NOT NULL
      AND date(timestamp) >= date('now', '-${days} days')
      GROUP BY scene
    `);

    const results = query.all() as Array<{ scene: string; count: number }>;
    const usage: Record<string, number> = {};

    results.forEach(result => {
      usage[result.scene] = result.count;
    });

    return usage;
  }

  /**
   * Получение процента ошибок
   */
  private async getErrorRate(days: number): Promise<number> {
    const totalEventsQuery = this.db.prepare(`
      SELECT COUNT(*) as count 
      FROM user_events 
      WHERE date(timestamp) >= date('now', '-${days} days')
    `);

    const errorEventsQuery = this.db.prepare(`
      SELECT COUNT(*) as count 
      FROM user_events 
      WHERE event LIKE '%error%' 
      AND date(timestamp) >= date('now', '-${days} days')
    `);

    const totalEvents = (totalEventsQuery.get() as { count: number }).count;
    const errorEvents = (errorEventsQuery.get() as { count: number }).count;

    return totalEvents > 0 ? (errorEvents / totalEvents) * 100 : 0;
  }

  /**
   * Получение коэффициента конверсии
   */
  private async getConversionRate(days: number): Promise<number> {
    const startedOrdersQuery = this.db.prepare(`
      SELECT COUNT(DISTINCT userId) as count 
      FROM user_events 
      WHERE event = 'start_order' 
      AND date(timestamp) >= date('now', '-${days} days')
    `);

    const completedOrdersQuery = this.db.prepare(`
      SELECT COUNT(DISTINCT userId) as count 
      FROM orders 
      WHERE status = 'Выполнен' 
      AND date(createdAt) >= date('now', '-${days} days')
    `);

    const startedOrders = (startedOrdersQuery.get() as { count: number }).count;
    const completedOrders = (completedOrdersQuery.get() as { count: number }).count;

    return startedOrders > 0 ? (completedOrders / startedOrders) * 100 : 0;
  }

  /**
   * Получение топ событий
   */
  async getTopEvents(days: number = 7, limit: number = 10): Promise<Array<{
    event: string;
    count: number;
  }>> {
    const query = this.db.prepare(`
      SELECT event, COUNT(*) as count
      FROM user_events
      WHERE date(timestamp) >= date('now', '-${days} days')
      GROUP BY event
      ORDER BY count DESC
      LIMIT ?
    `);

    return query.all(limit) as Array<{ event: string; count: number }>;
  }

  /**
   * Получение активности пользователя
   */
  async getUserActivity(userId: number, days: number = 30): Promise<Array<{
    event: string;
    scene?: string;
    timestamp: string;
  }>> {
    const query = this.db.prepare(`
      SELECT event, scene, timestamp
      FROM user_events
      WHERE userId = ?
      AND date(timestamp) >= date('now', '-${days} days')
      ORDER BY timestamp DESC
      LIMIT 100
    `);

    return query.all(userId) as Array<{
      event: string;
      scene?: string;
      timestamp: string;
    }>;
  }

  /**
   * Получение статистики по времени
   */
  async getHourlyStats(days: number = 7): Promise<Record<number, number>> {
    const query = this.db.prepare(`
      SELECT 
        CAST(strftime('%H', timestamp) AS INTEGER) as hour,
        COUNT(*) as count
      FROM user_events
      WHERE date(timestamp) >= date('now', '-${days} days')
      GROUP BY hour
      ORDER BY hour
    `);

    const results = query.all() as Array<{ hour: number; count: number }>;
    const hourlyStats: Record<number, number> = {};

    // Инициализируем все часы нулями
    for (let i = 0; i < 24; i++) {
      hourlyStats[i] = 0;
    }

    // Заполняем данными
    results.forEach(result => {
      hourlyStats[result.hour] = result.count;
    });

    return hourlyStats;
  }

  /**
   * Очистка старых событий
   */
  async cleanupOldEvents(daysToKeep: number = 90): Promise<number> {
    try {
      const query = this.db.prepare(`
        DELETE FROM user_events 
        WHERE date(timestamp) < date('now', '-${daysToKeep} days')
      `);

      const result = query.run();
      const deletedCount = result.changes;

      logger.info(`Cleaned up ${deletedCount} old analytics events`);
      return deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup old events', error);
      return 0;
    }
  }

  /**
   * Экспорт данных для анализа
   */
  async exportData(days: number = 30): Promise<{
    events: UserEvent[];
    metrics: AnalyticsMetrics;
  }> {
    const eventsQuery = this.db.prepare(`
      SELECT userId, event, scene, data, timestamp
      FROM user_events
      WHERE date(timestamp) >= date('now', '-${days} days')
      ORDER BY timestamp DESC
    `);

    const events = eventsQuery.all() as UserEvent[];
    const metrics = await this.getMetrics(days);

    return { events, metrics };
  }
}

// Экспортируем единственный экземпляр
export const analytics = new AnalyticsService(); 