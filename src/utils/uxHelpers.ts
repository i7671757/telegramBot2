import { Markup } from 'telegraf';
import { navigationManager } from '../services/NavigationManager';
import { feedbackManager } from '../services/FeedbackManager';
import type { AuthContext } from '../middlewares/auth';

/**
 * Создание улучшенной клавиатуры с навигацией
 */
export function createEnhancedKeyboard(
  ctx: AuthContext,
  buttons: Array<{ text: string; action?: string }>,
  options: {
    showBack?: boolean;
    showHome?: boolean;
    columns?: number;
    addBreadcrumbs?: boolean;
  } = {}
) {
  const { showBack = true, showHome = false, columns = 2, addBreadcrumbs = false } = options;
  
  return navigationManager.createNavigationKeyboard(
    ctx,
    buttons.map(btn => ({
      text: btn.text,
      action: btn.action || btn.text
    })),
    { showBack, showHome, columns }
  );
}

/**
 * Создание inline клавиатуры с улучшенной навигацией
 */
export function createEnhancedInlineKeyboard(
  ctx: AuthContext,
  buttons: Array<{ text: string; action: string; icon?: string }>,
  options: {
    showBack?: boolean;
    showHome?: boolean;
    addBreadcrumbs?: boolean;
  } = {}
) {
  const { showBack = true, showHome = false, addBreadcrumbs = false } = options;
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

  // Добавляем breadcrumbs если нужно
  if (addBreadcrumbs) {
    const breadcrumbButtons = navigationManager.createBreadcrumbButtons(ctx);
    if (breadcrumbButtons.length > 0) {
      // Добавляем по одной кнопке breadcrumb на строку
      breadcrumbButtons.forEach(btn => keyboard.push([btn]));
    }
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
 * Отправка сообщения с автоматическими индикаторами загрузки
 */
export async function sendWithLoading(
  ctx: AuthContext,
  asyncOperation: () => Promise<any>,
  options: {
    loadingMessage?: string;
    successMessage?: string;
    showProgress?: boolean;
    progressSteps?: string[];
  } = {}
): Promise<any> {
  const { loadingMessage, successMessage, showProgress = false, progressSteps = [] } = options;

  try {
    // Показываем индикатор загрузки
    await feedbackManager.showLoading(ctx, loadingMessage);

    let result;
    
    if (showProgress && progressSteps.length > 0) {
      // Показываем прогресс по шагам
      for (let i = 0; i < progressSteps.length; i++) {
        await feedbackManager.showProgress(ctx, i + 1, progressSteps.length, progressSteps[i]);
        
        // Имитируем выполнение шага (в реальности здесь будет часть операции)
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      result = await asyncOperation();
      await feedbackManager.hideProgress(ctx, successMessage);
    } else {
      result = await asyncOperation();
      await feedbackManager.hideLoading(ctx, successMessage);
    }

    return result;
  } catch (error) {
    await feedbackManager.hideLoading(ctx);
    await feedbackManager.hideProgress(ctx);
    await feedbackManager.showApiError(ctx, error);
    throw error;
  }
}

/**
 * Создание пагинированного списка с навигацией
 */
export function createPaginatedList<T>(
  items: T[],
  page: number,
  pageSize: number,
  formatItem: (item: T, index: number) => string
): {
  items: T[];
  currentPage: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  formattedText: string;
  navigationButtons: Array<{ text: string; action: string }>;
} {
  const totalPages = Math.ceil(items.length / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pageItems = items.slice(startIndex, endIndex);

  const formattedText = pageItems
    .map((item, index) => formatItem(item, startIndex + index))
    .join('\n');

  const navigationButtons: Array<{ text: string; action: string }> = [];

  if (page > 1) {
    navigationButtons.push({ text: '⬅️ Предыдущая', action: `page_${page - 1}` });
  }

  if (page < totalPages) {
    navigationButtons.push({ text: 'Следующая ➡️', action: `page_${page + 1}` });
  }

  return {
    items: pageItems,
    currentPage: page,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
    formattedText,
    navigationButtons
  };
}

/**
 * Создание информативного сообщения с контекстом
 */
export async function sendContextualMessage(
  ctx: AuthContext,
  message: string,
  options: {
    type?: 'info' | 'success' | 'warning' | 'error';
    showBreadcrumbs?: boolean;
    showHelp?: boolean;
    helpText?: string;
    keyboard?: any;
  } = {}
): Promise<void> {
  const { type = 'info', showBreadcrumbs = false, showHelp = false, helpText, keyboard } = options;

  let fullMessage = message;

  // Добавляем breadcrumbs если нужно
  if (showBreadcrumbs) {
    const breadcrumbs = navigationManager.getBreadcrumbs(ctx);
    if (breadcrumbs) {
      fullMessage = `${breadcrumbs}\n\n${message}`;
    }
  }

  // Добавляем помощь если нужно
  if (showHelp) {
    const help = helpText || getContextualHelp(ctx);
    if (help) {
      fullMessage += `\n\n💡 <i>${help}</i>`;
    }
  }

  // Отправляем сообщение в зависимости от типа
  switch (type) {
    case 'success':
      await feedbackManager.showSuccess(ctx, fullMessage);
      break;
    case 'warning':
      await feedbackManager.showWarning(ctx, fullMessage);
      break;
    case 'error':
      await feedbackManager.showError(ctx, fullMessage);
      break;
    default:
      await ctx.reply(fullMessage, {
        parse_mode: 'HTML',
        ...keyboard
      });
  }
}

/**
 * Получение контекстной помощи
 */
function getContextualHelp(ctx: AuthContext): string | null {
  const currentScene = (ctx.session as any)?.currentScene;
  
  switch (currentScene) {
    case 'categories':
      return 'Выберите категорию из списка для просмотра товаров';
    case 'products':
      return 'Нажмите на товар для просмотра деталей или добавления в корзину';
    case 'checkout':
      return 'Проверьте данные заказа перед подтверждением';
    case 'settings':
      return 'Здесь вы можете изменить свои личные данные';
    case 'orderHistory':
      return 'Просмотрите историю ваших заказов';
    default:
      return 'Используйте кнопки меню для навигации по боту';
  }
}

/**
 * Создание подтверждающего диалога
 */
export async function createConfirmationDialog(
  ctx: AuthContext,
  message: string,
  options: {
    confirmText?: string;
    cancelText?: string;
    confirmAction?: string;
    cancelAction?: string;
    showWarning?: boolean;
  } = {}
): Promise<void> {
  const {
    confirmText = '✅ Подтвердить',
    cancelText = '❌ Отменить',
    confirmAction = 'confirm_yes',
    cancelAction = 'confirm_no',
    showWarning = false
  } = options;

  let fullMessage = message;
  if (showWarning) {
    fullMessage = `⚠️ <b>Внимание!</b>\n\n${message}`;
  }

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback(confirmText, confirmAction),
      Markup.button.callback(cancelText, cancelAction)
    ]
  ]);

  await ctx.reply(fullMessage, {
    parse_mode: 'HTML',
    ...keyboard
  });
}

/**
 * Создание меню выбора с поиском
 */
export function createSearchableMenu<T>(
  items: T[],
  searchQuery: string,
  searchField: keyof T,
  formatItem: (item: T) => { text: string; action: string }
): {
  filteredItems: T[];
  buttons: Array<{ text: string; action: string }>;
  hasResults: boolean;
} {
  const filteredItems = searchQuery
    ? items.filter(item => {
        const fieldValue = item[searchField];
        return typeof fieldValue === 'string' && 
               fieldValue.toLowerCase().includes(searchQuery.toLowerCase());
      })
    : items;

  const buttons = filteredItems.map(formatItem);

  return {
    filteredItems,
    buttons,
    hasResults: filteredItems.length > 0
  };
}

/**
 * Создание адаптивной клавиатуры в зависимости от размера экрана
 */
export function createAdaptiveKeyboard(
  ctx: AuthContext,
  buttons: Array<{ text: string; action?: string }>,
  options: {
    maxColumns?: number;
    minColumns?: number;
    showBack?: boolean;
  } = {}
): any {
  const { maxColumns = 3, minColumns = 1, showBack = true } = options;
  
  // Определяем количество колонок на основе количества кнопок
  let columns = Math.min(maxColumns, Math.max(minColumns, Math.ceil(Math.sqrt(buttons.length))));
  
  // Корректируем для лучшего отображения
  if (buttons.length <= 2) columns = buttons.length;
  else if (buttons.length <= 4) columns = 2;
  else if (buttons.length <= 9) columns = 3;

  return createEnhancedKeyboard(ctx, buttons, { columns, showBack });
}

/**
 * Валидация пользовательского ввода с обратной связью
 */
export async function validateAndProcess<T>(
  ctx: AuthContext,
  input: string,
  validators: Array<{
    validate: (input: string) => boolean;
    errorMessage: string;
  }>,
  processor: (input: string) => Promise<T>
): Promise<T | null> {
  // Проверяем все валидаторы
  for (const validator of validators) {
    if (!validator.validate(input)) {
      await feedbackManager.showValidationError(ctx, 'input', validator.errorMessage);
      return null;
    }
  }

  try {
    // Показываем индикатор загрузки во время обработки
    await feedbackManager.showLoading(ctx, 'Обработка данных...');
    const result = await processor(input);
    await feedbackManager.hideLoading(ctx, 'Данные обработаны успешно!');
    return result;
  } catch (error) {
    await feedbackManager.hideLoading(ctx);
    await feedbackManager.showApiError(ctx, error);
    return null;
  }
}

/**
 * Создание интерактивного списка с действиями
 */
export function createInteractiveList<T>(
  items: T[],
  formatItem: (item: T, index: number) => string,
  actions: Array<{ text: string; action: string; icon?: string }> = []
): {
  formattedText: string;
  actionButtons: Array<{ text: string; action: string }>;
} {
  const formattedText = items.length > 0
    ? items.map((item, index) => `${index + 1}. ${formatItem(item, index)}`).join('\n')
    : 'Список пуст';

  const actionButtons = actions.map(action => ({
    text: action.icon ? `${action.icon} ${action.text}` : action.text,
    action: action.action
  }));

  return {
    formattedText,
    actionButtons
  };
}

/**
 * Обработчик ошибок с пользовательской обратной связью
 */
export async function handleErrorWithFeedback(
  ctx: AuthContext,
  error: any,
  context: string = 'operation'
): Promise<void> {
  // Логируем ошибку
  console.error(`Error in ${context}:`, error);

  // Скрываем все активные индикаторы
  await feedbackManager.hideLoading(ctx);
  await feedbackManager.hideProgress(ctx);

  // Показываем пользователю соответствующее сообщение
  if (error.response) {
    await feedbackManager.showApiError(ctx, error);
  } else if (error.message) {
    await feedbackManager.showError(ctx, {
      type: 'error',
      title: 'Произошла ошибка',
      description: error.message,
      action: 'Попробуйте еще раз или обратитесь в поддержку'
    });
  } else {
    await feedbackManager.showError(ctx, {
      type: 'error',
      title: 'Неизвестная ошибка',
      description: 'Что-то пошло не так',
      action: 'Попробуйте еще раз'
    });
  }
} 