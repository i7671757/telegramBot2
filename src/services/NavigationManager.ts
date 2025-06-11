import { Markup } from 'telegraf';
import { logger } from '../utils/logger';
import type { AuthContext } from '../middlewares/auth';

interface NavigationState {
  currentScene: string;
  previousScene?: string;
  breadcrumbs: string[];
  timestamp: number;
}

interface SceneConfig {
  name: string;
  title: string;
  parent?: string;
  allowBack: boolean;
  showBreadcrumbs: boolean;
  customBackAction?: string;
}

interface NavigationButton {
  text: string;
  action: string;
  icon?: string;
  style?: 'primary' | 'secondary' | 'danger' | 'success';
}

export class NavigationManager {
  private static instance: NavigationManager;
  private sceneConfigs: Map<string, SceneConfig> = new Map();
  private navigationHistory: Map<string, NavigationState[]> = new Map();

  private constructor() {
    this.initializeSceneConfigs();
  }

  static getInstance(): NavigationManager {
    if (!NavigationManager.instance) {
      NavigationManager.instance = new NavigationManager();
    }
    return NavigationManager.instance;
  }

  /**
   * Инициализация конфигурации сцен
   */
  private initializeSceneConfigs(): void {
    const configs: SceneConfig[] = [
      // Основные сцены
      { name: 'start', title: 'Добро пожаловать', allowBack: false, showBreadcrumbs: false },
      { name: 'mainMenu', title: 'Главное меню', allowBack: false, showBreadcrumbs: false },
      
      // Заказ
      { name: 'newOrder', title: 'Новый заказ', parent: 'mainMenu', allowBack: true, showBreadcrumbs: true },
      { name: 'categories', title: 'Категории', parent: 'newOrder', allowBack: true, showBreadcrumbs: true },
      { name: 'products', title: 'Продукты', parent: 'categories', allowBack: true, showBreadcrumbs: true },
      { name: 'checkout', title: 'Оформление заказа', parent: 'products', allowBack: true, showBreadcrumbs: true },
      
      // Настройки
      { name: 'settings', title: 'Настройки', parent: 'mainMenu', allowBack: true, showBreadcrumbs: true },
      { name: 'changeName', title: 'Изменить имя', parent: 'settings', allowBack: true, showBreadcrumbs: true },
      { name: 'changeNumber', title: 'Изменить номер', parent: 'settings', allowBack: true, showBreadcrumbs: true },
      { name: 'changeCity', title: 'Изменить город', parent: 'settings', allowBack: true, showBreadcrumbs: true },
      { name: 'branchInfo', title: 'Информация о филиале', parent: 'settings', allowBack: true, showBreadcrumbs: true },
      
      // Профиль и история
      { name: 'orderHistory', title: 'История заказов', parent: 'mainMenu', allowBack: true, showBreadcrumbs: true },
      { name: 'profile', title: 'Профиль', parent: 'mainMenu', allowBack: true, showBreadcrumbs: true },
      
      // Авторизация
      { name: 'userSign', title: 'Авторизация', allowBack: true, showBreadcrumbs: false, customBackAction: 'mainMenu' },
      
      // Обратная связь
      { name: 'callback', title: 'Обратная связь', parent: 'mainMenu', allowBack: true, showBreadcrumbs: true },
      { name: 'review', title: 'Отзыв', parent: 'mainMenu', allowBack: true, showBreadcrumbs: true }
    ];

    configs.forEach(config => {
      this.sceneConfigs.set(config.name, config);
    });
  }

  /**
   * Получение ключа пользователя для истории навигации
   */
  private getUserKey(ctx: AuthContext): string {
    return `${ctx.from?.id || 'unknown'}:${ctx.chat?.id || 'unknown'}`;
  }

  /**
   * Вход в сцену с обновлением навигации
   */
  async enterScene(ctx: AuthContext, sceneName: string, options: {
    updateHistory?: boolean;
    customTitle?: string;
    showWelcome?: boolean;
  } = {}): Promise<void> {
    const { updateHistory = true, customTitle, showWelcome = true } = options;
    const userKey = this.getUserKey(ctx);
    const config = this.sceneConfigs.get(sceneName);

    if (!config) {
      logger.warn(`Scene config not found for: ${sceneName}`);
      return;
    }

    // Обновляем историю навигации
    if (updateHistory) {
      this.updateNavigationHistory(ctx, sceneName);
    }

    // Обновляем сессию
    if (ctx.session) {
      ctx.session.previousScene = (ctx.session as any).currentScene || 'mainMenu';
      (ctx.session as any).currentScene = sceneName;
    }

    // Показываем приветственное сообщение если нужно
    if (showWelcome && config.showBreadcrumbs) {
      const breadcrumbs = this.getBreadcrumbs(ctx, sceneName);
      if (breadcrumbs) {
        await ctx.reply(breadcrumbs, { parse_mode: 'HTML' });
      }
    }

    logger.info(`Navigation: ${ctx.from?.id} entered scene ${sceneName}`, {
      userId: ctx.from?.id,
      previousScene: ctx.session?.previousScene,
      currentScene: sceneName
    });
  }

  /**
   * Обновление истории навигации
   */
  private updateNavigationHistory(ctx: AuthContext, sceneName: string): void {
    const userKey = this.getUserKey(ctx);
    const currentHistory = this.navigationHistory.get(userKey) || [];
    
    const navigationState: NavigationState = {
      currentScene: sceneName,
      previousScene: (ctx.session as any)?.currentScene,
      breadcrumbs: this.buildBreadcrumbsArray(sceneName),
      timestamp: Date.now()
    };

    // Ограничиваем историю последними 10 переходами
    const updatedHistory = [...currentHistory, navigationState].slice(-10);
    this.navigationHistory.set(userKey, updatedHistory);
  }

  /**
   * Построение массива breadcrumbs
   */
  private buildBreadcrumbsArray(sceneName: string): string[] {
    const breadcrumbs: string[] = [];
    let currentScene = sceneName;

    while (currentScene) {
      const config = this.sceneConfigs.get(currentScene);
      if (config) {
        breadcrumbs.unshift(config.title);
        currentScene = config.parent || '';
      } else {
        break;
      }
    }

    return breadcrumbs;
  }

  /**
   * Получение breadcrumbs для отображения
   */
  getBreadcrumbs(ctx: AuthContext, sceneName?: string): string | null {
    const scene = sceneName || (ctx.session as any)?.currentScene;
    if (!scene) return null;

    const config = this.sceneConfigs.get(scene);
    if (!config || !config.showBreadcrumbs) return null;

    const breadcrumbs = this.buildBreadcrumbsArray(scene);
    if (breadcrumbs.length <= 1) return null;

    const breadcrumbText = breadcrumbs.join(' → ');
    return `📍 <b>${breadcrumbText}</b>`;
  }

  /**
   * Создание кнопки "Назад"
   */
  createBackButton(ctx: AuthContext, customText?: string): any {
    const currentScene = (ctx.session as any)?.currentScene;
    const config = this.sceneConfigs.get(currentScene);
    
    if (!config || !config.allowBack) {
      return null;
    }

    const backText = customText || ctx.i18n.t('navigation.back') || '← Назад';
    return Markup.button.text(backText);
  }

  /**
   * Обработка нажатия кнопки "Назад"
   */
  async handleBackButton(ctx: AuthContext): Promise<boolean> {
    const currentScene = (ctx.session as any)?.currentScene;
    const config = this.sceneConfigs.get(currentScene);

    if (!config || !config.allowBack) {
      return false;
    }

    let targetScene: string;

    // Используем кастомное действие если указано
    if (config.customBackAction) {
      targetScene = config.customBackAction;
    }
    // Используем родительскую сцену
    else if (config.parent) {
      targetScene = config.parent;
    }
    // Используем предыдущую сцену из сессии
    else if (ctx.session?.previousScene) {
      targetScene = ctx.session.previousScene;
    }
    // По умолчанию возвращаемся в главное меню
    else {
      targetScene = 'mainMenu';
    }

    logger.info(`Navigation: Back button pressed`, {
      userId: ctx.from?.id,
      from: currentScene,
      to: targetScene
    });

    await ctx.scene.enter(targetScene);
    return true;
  }

  /**
   * Создание навигационной клавиатуры
   */
  createNavigationKeyboard(ctx: AuthContext, buttons: NavigationButton[], options: {
    showBack?: boolean;
    showHome?: boolean;
    columns?: number;
  } = {}): any {
    const { showBack = true, showHome = false, columns = 2 } = options;
    const keyboard: any[][] = [];

    // Основные кнопки
    const mainButtons = buttons.map(button => {
      let buttonText = button.text;
      if (button.icon) {
        buttonText = `${button.icon} ${buttonText}`;
      }
      return Markup.button.text(buttonText);
    });

    // Разбиваем на строки
    for (let i = 0; i < mainButtons.length; i += columns) {
      keyboard.push(mainButtons.slice(i, i + columns));
    }

    // Добавляем навигационные кнопки
    const navButtons = [];
    
    if (showBack) {
      const backButton = this.createBackButton(ctx);
      if (backButton) {
        navButtons.push(backButton);
      }
    }

    if (showHome) {
      const homeText = ctx.i18n.t('navigation.home') || '🏠 Главная';
      navButtons.push(Markup.button.text(homeText));
    }

    if (navButtons.length > 0) {
      keyboard.push(navButtons);
    }

    return Markup.keyboard(keyboard).resize();
  }

  /**
   * Создание inline клавиатуры с навигацией
   */
  createInlineNavigationKeyboard(ctx: AuthContext, buttons: NavigationButton[], options: {
    showBack?: boolean;
    showHome?: boolean;
  } = {}): any {
    const { showBack = true, showHome = false } = options;
    const keyboard: any[][] = [];

    // Основные кнопки
    const mainButtons = buttons.map(button => {
      let buttonText = button.text;
      if (button.icon) {
        buttonText = `${button.icon} ${buttonText}`;
      }
      return Markup.button.callback(buttonText, button.action);
    });

    // Разбиваем на строки по 2 кнопки
    for (let i = 0; i < mainButtons.length; i += 2) {
      keyboard.push(mainButtons.slice(i, i + 2));
    }

    // Добавляем навигационные кнопки
    const navButtons = [];
    
    if (showBack) {
      const backText = ctx.i18n.t('navigation.back') || '← Назад';
      navButtons.push(Markup.button.callback(backText, 'nav_back'));
    }

    if (showHome) {
      const homeText = ctx.i18n.t('navigation.home') || '🏠 Главная';
      navButtons.push(Markup.button.callback(homeText, 'nav_home'));
    }

    if (navButtons.length > 0) {
      keyboard.push(navButtons);
    }

    return Markup.inlineKeyboard(keyboard);
  }

  /**
   * Обработка inline навигационных действий
   */
  async handleInlineNavigation(ctx: AuthContext, action: string): Promise<boolean> {
    switch (action) {
      case 'nav_back':
        return await this.handleBackButton(ctx);
        
      case 'nav_home':
        await ctx.scene.enter('mainMenu');
        return true;
        
      default:
        return false;
    }
  }

  /**
   * Проверка является ли текст командой "Назад"
   */
  isBackCommand(ctx: AuthContext, text: string): boolean {
    const backTexts = [
      ctx.i18n.t('navigation.back'),
      ctx.i18n.t('back'),
      'Назад',
      'Back',
      'Orqaga',
      '← Назад',
      '⬅️ Назад'
    ].filter(Boolean);

    return backTexts.some(backText => 
      text === backText || 
      text.toLowerCase().includes(backText.toLowerCase())
    );
  }

  /**
   * Проверка является ли текст командой "Главная"
   */
  isHomeCommand(ctx: AuthContext, text: string): boolean {
    const homeTexts = [
      ctx.i18n.t('navigation.home'),
      'Главная',
      'Home',
      'Bosh sahifa',
      '🏠 Главная',
      '🏠 Home'
    ].filter(Boolean);

    return homeTexts.some(homeText => 
      text === homeText || 
      text.toLowerCase().includes(homeText.toLowerCase())
    );
  }

  /**
   * Получение истории навигации пользователя
   */
  getNavigationHistory(ctx: AuthContext): NavigationState[] {
    const userKey = this.getUserKey(ctx);
    return this.navigationHistory.get(userKey) || [];
  }

  /**
   * Очистка истории навигации пользователя
   */
  clearNavigationHistory(ctx: AuthContext): void {
    const userKey = this.getUserKey(ctx);
    this.navigationHistory.delete(userKey);
  }

  /**
   * Получение предыдущей сцены
   */
  getPreviousScene(ctx: AuthContext): string | null {
    const history = this.getNavigationHistory(ctx);
    if (history.length < 2) return null;
    
    return history[history.length - 2].currentScene;
  }

  /**
   * Создание быстрой навигации (хлебные крошки как кнопки)
   */
  createBreadcrumbButtons(ctx: AuthContext): any[] {
    const currentScene = (ctx.session as any)?.currentScene;
    if (!currentScene) return [];

    const breadcrumbs = this.buildBreadcrumbsArray(currentScene);
    const buttons: any[] = [];

    // Создаем кнопки для каждого уровня (кроме текущего)
    for (let i = 0; i < breadcrumbs.length - 1; i++) {
      const sceneName = this.findSceneByTitle(breadcrumbs[i]);
      if (sceneName) {
        buttons.push(
          Markup.button.callback(
            `📍 ${breadcrumbs[i]}`,
            `nav_to_${sceneName}`
          )
        );
      }
    }

    return buttons;
  }

  /**
   * Поиск сцены по названию
   */
  private findSceneByTitle(title: string): string | null {
    for (const [sceneName, config] of this.sceneConfigs.entries()) {
      if (config.title === title) {
        return sceneName;
      }
    }
    return null;
  }

  /**
   * Обработка навигации по breadcrumbs
   */
  async handleBreadcrumbNavigation(ctx: AuthContext, action: string): Promise<boolean> {
    if (!action.startsWith('nav_to_')) return false;

    const targetScene = action.replace('nav_to_', '');
    const config = this.sceneConfigs.get(targetScene);

    if (!config) return false;

    await ctx.scene.enter(targetScene);
    return true;
  }

  /**
   * Получение конфигурации сцены
   */
  getSceneConfig(sceneName: string): SceneConfig | undefined {
    return this.sceneConfigs.get(sceneName);
  }

  /**
   * Обновление конфигурации сцены
   */
  updateSceneConfig(sceneName: string, updates: Partial<SceneConfig>): void {
    const existing = this.sceneConfigs.get(sceneName);
    if (existing) {
      this.sceneConfigs.set(sceneName, { ...existing, ...updates });
    }
  }
}

// Создаем единственный экземпляр
export const navigationManager = NavigationManager.getInstance(); 