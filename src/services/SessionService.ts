import fs from 'fs';
import path from 'path';
import type { AuthContext } from '../middlewares/auth';
import { memoryManager } from './MemoryManager';

export interface UserSession {
  language: string;
  registered: boolean;
  phone: string | null;
  currentCity: string | null;
  selectedCity: number | null;
  isAuthenticated?: boolean;
  otpRetries?: number;
  lastOtpSent?: number;
  cart?: {
    items: Array<{
      id: number;
      name: string;
      price: number;
      quantity: number;
    }>;
    total: number;
    updatedAt: string;
  };
  // Дополнительные поля для заказов
  selectedBranch?: number | null;
  deliveryType?: 'pickup' | 'delivery';
  address?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  // Временные данные для процесса заказа
  additionalPhone?: string;
  includeCutlery?: boolean;
  lastViewedOrder?: string;
}

interface SessionData {
  id: string;
  data: UserSession;
}

interface SessionFile {
  sessions: SessionData[];
}

export class SessionService {
  private static instance: SessionService;
  private sessionPath: string;
  private lockMap = new Map<string, Promise<void>>();
  private cache = new Map<string, UserSession>();
  private cacheTimeout = 5 * 60 * 1000; // 5 минут
  private lastCacheUpdate = new Map<string, number>();

  private constructor(sessionPath: string = './sessions.json') {
    this.sessionPath = sessionPath;
    this.ensureSessionFile();
  }

  static getInstance(sessionPath?: string): SessionService {
    if (!SessionService.instance) {
      SessionService.instance = new SessionService(sessionPath);
    }
    return SessionService.instance;
  }

  /**
   * Убедиться что файл сессий существует
   */
  private ensureSessionFile(): void {
    try {
      if (!fs.existsSync(this.sessionPath)) {
        const initialData: SessionFile = { sessions: [] };
        fs.writeFileSync(this.sessionPath, JSON.stringify(initialData, null, 2));
        console.log(`Created new session file: ${this.sessionPath}`);
      }
    } catch (error) {
      console.error('Error ensuring session file exists:', error);
      throw new Error('Failed to initialize session file');
    }
  }

  /**
   * Получить ключ сессии для пользователя
   */
  private getSessionKey(userId: number, chatId: number): string {
    return `${userId}:${chatId}`;
  }

  /**
   * Валидация данных сессии
   */
  private validateSession(session: UserSession): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Проверка обязательных полей
    if (!session.language || typeof session.language !== 'string') {
      errors.push('Invalid or missing language');
    }

    if (typeof session.registered !== 'boolean') {
      errors.push('Invalid registered field');
    }

    // Проверка телефона если пользователь зарегистрирован
    if (session.registered && (!session.phone || typeof session.phone !== 'string')) {
      errors.push('Registered user must have valid phone number');
    }

    // Проверка города
    if (session.selectedCity !== null && (typeof session.selectedCity !== 'number' || session.selectedCity <= 0)) {
      errors.push('Invalid selectedCity value');
    }

    // Проверка корзины
    if (session.cart) {
      if (!Array.isArray(session.cart.items)) {
        errors.push('Cart items must be an array');
      } else {
        session.cart.items.forEach((item, index) => {
          if (!item.id || !item.name || typeof item.price !== 'number' || typeof item.quantity !== 'number') {
            errors.push(`Invalid cart item at index ${index}`);
          }
        });
      }

      if (typeof session.cart.total !== 'number' || session.cart.total < 0) {
        errors.push('Invalid cart total');
      }
    }

    // Проверка координат
    if (session.coordinates) {
      if (typeof session.coordinates.latitude !== 'number' || typeof session.coordinates.longitude !== 'number') {
        errors.push('Invalid coordinates format');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Создать сессию по умолчанию
   */
  private createDefaultSession(): UserSession {
    return {
      language: 'en',
      registered: false,
      phone: null,
      currentCity: null,
      selectedCity: null,
      isAuthenticated: false,
      otpRetries: 0
    };
  }

  /**
   * Получить сессию с блокировкой для предотвращения concurrent access
   */
  async getSession(userId: number, chatId: number): Promise<UserSession> {
    const sessionKey = this.getSessionKey(userId, chatId);
    
    // Проверить кэш
    const cached = this.getCachedSession(sessionKey);
    if (cached) {
      return { ...cached }; // Возвращаем копию
    }

    // Получить блокировку
    await this.acquireLock(sessionKey);

    try {
      const sessionData = await this.readSessionFromFile(sessionKey);
      
      if (sessionData) {
        const validation = this.validateSession(sessionData);
        if (!validation.isValid) {
          console.warn(`Session validation failed for ${sessionKey}:`, validation.errors);
          // Создаем новую валидную сессию
          const defaultSession = this.createDefaultSession();
          await this.saveSessionToFile(sessionKey, defaultSession);
          this.updateCache(sessionKey, defaultSession);
          return { ...defaultSession };
        }
        
        this.updateCache(sessionKey, sessionData);
        return { ...sessionData };
      } else {
        // Создать новую сессию
        const defaultSession = this.createDefaultSession();
        await this.saveSessionToFile(sessionKey, defaultSession);
        this.updateCache(sessionKey, defaultSession);
        return { ...defaultSession };
      }
    } finally {
      this.releaseLock(sessionKey);
    }
  }

  /**
   * Сохранить сессию с блокировкой
   */
  async saveSession(userId: number, chatId: number, session: UserSession): Promise<void> {
    const sessionKey = this.getSessionKey(userId, chatId);

    // Валидация перед сохранением
    const validation = this.validateSession(session);
    if (!validation.isValid) {
      throw new Error(`Session validation failed: ${validation.errors.join(', ')}`);
    }

    // Автоматическая оптимизация сессии
    const optimizedSession = await memoryManager.autoOptimizeSession(userId, chatId, session);

    // Получить блокировку
    await this.acquireLock(sessionKey);

    try {
      await this.saveSessionToFile(sessionKey, optimizedSession);
      this.updateCache(sessionKey, optimizedSession);
      console.log(`Session saved for ${sessionKey}`);
    } finally {
      this.releaseLock(sessionKey);
    }
  }

  /**
   * Обновить сессию (частичное обновление)
   */
  async updateSession(userId: number, chatId: number, updates: Partial<UserSession>): Promise<UserSession> {
    const sessionKey = this.getSessionKey(userId, chatId);
    
    await this.acquireLock(sessionKey);

    try {
      const currentSession = await this.readSessionFromFile(sessionKey) || this.createDefaultSession();
      const updatedSession = { ...currentSession, ...updates };

      const validation = this.validateSession(updatedSession);
      if (!validation.isValid) {
        throw new Error(`Session validation failed: ${validation.errors.join(', ')}`);
      }

      await this.saveSessionToFile(sessionKey, updatedSession);
      this.updateCache(sessionKey, updatedSession);
      
      return { ...updatedSession };
    } finally {
      this.releaseLock(sessionKey);
    }
  }

  /**
   * Удалить сессию
   */
  async deleteSession(userId: number, chatId: number): Promise<void> {
    const sessionKey = this.getSessionKey(userId, chatId);
    
    await this.acquireLock(sessionKey);

    try {
      const sessions = await this.readAllSessions();
      const filteredSessions = sessions.sessions.filter(s => s.id !== sessionKey);
      
      await this.writeAllSessions({ sessions: filteredSessions });
      this.cache.delete(sessionKey);
      this.lastCacheUpdate.delete(sessionKey);
      
      console.log(`Session deleted for ${sessionKey}`);
    } finally {
      this.releaseLock(sessionKey);
    }
  }

  /**
   * Получить все сессии (для администрирования)
   */
  async getAllSessions(): Promise<SessionData[]> {
    const data = await this.readAllSessions();
    return data.sessions;
  }

  /**
   * Очистить устаревшие сессии
   */
  async cleanupSessions(maxAge: number = 30 * 24 * 60 * 60 * 1000): Promise<number> {
    const sessions = await this.readAllSessions();
    const now = Date.now();
    let cleanedCount = 0;

    const activeSessions = sessions.sessions.filter(session => {
      // Если есть cart с updatedAt, используем его для определения активности
      if (session.data.cart?.updatedAt) {
        const lastActivity = new Date(session.data.cart.updatedAt).getTime();
        if (now - lastActivity > maxAge) {
          cleanedCount++;
          return false;
        }
      }
      return true;
    });

    if (cleanedCount > 0) {
      await this.writeAllSessions({ sessions: activeSessions });
      console.log(`Cleaned up ${cleanedCount} inactive sessions`);
    }

    return cleanedCount;
  }

  /**
   * Получить статистику использования памяти
   */
  async getMemoryStats() {
    return await memoryManager.getMemoryStats();
  }

  /**
   * Выполнить полную очистку памяти
   */
  async performMemoryCleanup() {
    return await memoryManager.performFullCleanup();
  }

  /**
   * Проверить размер конкретной сессии
   */
  async checkSessionSize(userId: number, chatId: number) {
    const session = await this.getSession(userId, chatId);
    return memoryManager.checkSessionSize(session);
  }

  /**
   * Получить статистику сессий
   */
  async getSessionStats(): Promise<{
    total: number;
    registered: number;
    withCart: number;
    languages: Record<string, number>;
  }> {
    const sessions = await this.readAllSessions();
    
    const stats = {
      total: sessions.sessions.length,
      registered: 0,
      withCart: 0,
      languages: {} as Record<string, number>
    };

    sessions.sessions.forEach(session => {
      if (session.data.registered) stats.registered++;
      if (session.data.cart && session.data.cart.items.length > 0) stats.withCart++;
      
      const lang = session.data.language || 'unknown';
      stats.languages[lang] = (stats.languages[lang] || 0) + 1;
    });

    return stats;
  }

  // Приватные методы для работы с файлами и кэшем

  private getCachedSession(sessionKey: string): UserSession | null {
    const cached = this.cache.get(sessionKey);
    const lastUpdate = this.lastCacheUpdate.get(sessionKey);
    
    if (cached && lastUpdate && (Date.now() - lastUpdate) < this.cacheTimeout) {
      return cached;
    }
    
    return null;
  }

  private updateCache(sessionKey: string, session: UserSession): void {
    this.cache.set(sessionKey, { ...session });
    this.lastCacheUpdate.set(sessionKey, Date.now());
  }

  private async acquireLock(sessionKey: string): Promise<void> {
    const existingLock = this.lockMap.get(sessionKey);
    if (existingLock) {
      await existingLock;
    }

    let resolveLock: () => void;
    const lockPromise = new Promise<void>(resolve => {
      resolveLock = resolve;
    });

    this.lockMap.set(sessionKey, lockPromise);
    
    // Автоматически освобождаем блокировку через 10 секунд
    setTimeout(() => {
      if (this.lockMap.get(sessionKey) === lockPromise) {
        this.releaseLock(sessionKey);
      }
    }, 10000);
  }

  private releaseLock(sessionKey: string): void {
    this.lockMap.delete(sessionKey);
  }

  private async readSessionFromFile(sessionKey: string): Promise<UserSession | null> {
    try {
      const data = await this.readAllSessions();
      const sessionData = data.sessions.find(s => s.id === sessionKey);
      return sessionData ? sessionData.data : null;
    } catch (error) {
      console.error('Error reading session from file:', error);
      return null;
    }
  }

  private async saveSessionToFile(sessionKey: string, session: UserSession): Promise<void> {
    try {
      const data = await this.readAllSessions();
      const existingIndex = data.sessions.findIndex(s => s.id === sessionKey);
      
      if (existingIndex >= 0) {
        data.sessions[existingIndex].data = session;
      } else {
        data.sessions.push({ id: sessionKey, data: session });
      }
      
      await this.writeAllSessions(data);
    } catch (error) {
      console.error('Error saving session to file:', error);
      throw error;
    }
  }

  private async readAllSessions(): Promise<SessionFile> {
    try {
      const fileContent = await fs.promises.readFile(this.sessionPath, 'utf8');
      return JSON.parse(fileContent);
    } catch (error) {
      console.error('Error reading sessions file:', error);
      return { sessions: [] };
    }
  }

  private async writeAllSessions(data: SessionFile): Promise<void> {
    try {
      await fs.promises.writeFile(this.sessionPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error writing sessions file:', error);
      throw error;
    }
  }
}

// Экспортируем единственный экземпляр
export const sessionService = SessionService.getInstance(); 