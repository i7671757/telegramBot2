import { Scenes, Markup } from 'telegraf';
import type { AuthContext } from '../middlewares/auth';
import { fetchCategories, getCategoryName, getCategoryImageUrl } from '../utils/categories';
import type { Category } from '../utils/categories';
import { navigationManager } from '../services/NavigationManager';
import { feedbackManager } from '../services/FeedbackManager';
import { sendWithLoading, createEnhancedKeyboard, handleErrorWithFeedback } from '../utils/uxHelpers';
import { registerSceneCommandHandlers, shouldSkipCommand } from '../utils/commandMenu';

// Temporary variable to store categories during the session lifetime
let tempCategories: Category[] = [];

const enhancedCategoriesScene = new Scenes.BaseScene<AuthContext>('enhancedCategories');

// Регистрируем глобальные обработчики команд для этой сцены
registerSceneCommandHandlers(enhancedCategoriesScene, 'Categories');

enhancedCategoriesScene.enter(async (ctx) => {
  try {
    // Обновляем навигацию
    await navigationManager.enterScene(ctx, 'categories');

    // Загружаем категории с индикатором загрузки
    const categories = await sendWithLoading(
      ctx,
      () => fetchCategories(),
      {
        loadingMessage: ctx.i18n.t('feedback.loading') || '⏳ Загружаем категории...',
        successMessage: undefined, // Не показываем сообщение об успехе
        showProgress: true,
        progressSteps: [
          'Подключение к серверу...',
          'Загрузка категорий...',
          'Подготовка меню...'
        ]
      }
    );
    
    if (!categories || categories.length === 0) {
      await feedbackManager.showWarning(
        ctx,
        ctx.i18n.t('categories.empty') || 'Нет доступных категорий',
        'Попробуйте позже или обратитесь в поддержку'
      );
      return;
    }
    
    // Store categories in temporary variable
    tempCategories = categories;
    
    // Get current language
    const language = ctx.i18n.locale();
    
    // Define emoji icons for categories
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
    
    // Prepare category buttons
    const categoryButtons = categories.map((category: Category) => {
      const categoryName = getCategoryName(category, language);
      const icon = category.icon || categoryIcons[categoryName] || '🍽️';
      return {
        text: `${icon} ${categoryName}`,
        action: categoryName
      };
    });

    // Create enhanced keyboard with navigation
    const keyboard = createEnhancedKeyboard(ctx, categoryButtons, {
      showBack: true,
      showHome: false,
      columns: 2
    });
    
    // Show breadcrumbs and menu
    const breadcrumbs = navigationManager.getBreadcrumbs(ctx);
    let message = '<b>Категории товаров</b>\n\nВыберите категорию для просмотра товаров:';
    
    if (breadcrumbs) {
      message = `${breadcrumbs}\n\n${message}`;
    }
    
    await ctx.replyWithHTML(message, keyboard);
    
  } catch (error) {
    await handleErrorWithFeedback(ctx, error, 'categories loading');
  }
});

// Handle back button with navigation manager
enhancedCategoriesScene.hears(/^(← Назад|⬅️ Назад|Назад|Back|Orqaga)$/i, async (ctx) => {
  const handled = await navigationManager.handleBackButton(ctx);
  if (!handled) {
    await ctx.scene.enter('startOrder');
  }
});

// Handle cart button
enhancedCategoriesScene.hears(/^🛒/, async (ctx) => {
  console.log('Cart button pressed in enhanced categories scene');
  ctx.session.previousScene = 'categories';
  await showEnhancedCart(ctx);
});

// Handle text messages (category selection)
enhancedCategoriesScene.on('text', async (ctx) => {
  const messageText = ctx.message.text;
  
  // Skip commands
  if (shouldSkipCommand(messageText, 'Categories')) {
    return;
  }

  // Handle navigation commands
  if (navigationManager.isBackCommand(ctx, messageText)) {
    await navigationManager.handleBackButton(ctx);
    return;
  }

  if (navigationManager.isHomeCommand(ctx, messageText)) {
    await ctx.scene.enter('mainMenu');
    return;
  }

  // Handle cart operations
  if (messageText === ctx.i18n.t('cart.clear') || 
      messageText.includes('🗑') ||
      messageText.includes('Очистить')) {
    await handleClearCart(ctx);
    return;
  }
  
  if (messageText === ctx.i18n.t('cart_button') || 
      messageText.includes('🛒')) {
    ctx.session.previousScene = 'categories';
    await showEnhancedCart(ctx);
    return;
  }

  if (messageText === ctx.i18n.t('cart.checkout') || 
      messageText.includes('Оформить')) {
    await handleCheckout(ctx);
    return;
  }
  
  // Handle category selection
  await handleCategorySelection(ctx, messageText);
});

/**
 * Обработка выбора категории
 */
async function handleCategorySelection(ctx: AuthContext, messageText: string) {
  try {
    // Show loading for category processing
    await feedbackManager.showLoading(ctx, 'Загружаем товары...');

    const language = ctx.i18n.locale();
    
    // Find selected category
    const selectedCategory = tempCategories.find(category => {
      const categoryName = getCategoryName(category, language);
      const cleanMessageText = messageText.replace(/^[🍽️✈️🧊🍱🍗🍟🌮🍔🌭]\s*/, '');
      return categoryName === cleanMessageText || messageText.includes(categoryName);
    });

    await feedbackManager.hideLoading(ctx);

    if (!selectedCategory) {
      await feedbackManager.showWarning(
        ctx,
        'Категория не найдена',
        'Пожалуйста, выберите категорию из меню ниже'
      );
      return;
    }

    // Store selected category in session
    if (!ctx.session) {
      ctx.session = {
        language: 'en',
        registered: false,
        phone: null,
        currentCity: null,
        selectedCity: null
      };
    }
    
    (ctx.session as any).selectedCategory = selectedCategory;
    
    // Show success message and navigate to products
    await feedbackManager.showSuccess(
      ctx,
      `Выбрана категория: ${getCategoryName(selectedCategory, language)}`,
      'Переходим к товарам...'
    );
    
    // Navigate to products scene
    setTimeout(async () => {
      await ctx.scene.enter('products');
    }, 1000);
    
  } catch (error) {
    await handleErrorWithFeedback(ctx, error, 'category selection');
  }
}

/**
 * Обработка очистки корзины
 */
async function handleClearCart(ctx: AuthContext) {
  try {
    const userId = ctx.from?.id;
    if (!userId) {
      await feedbackManager.showError(ctx, 'Не удалось определить пользователя');
      return;
    }

    // Show confirmation dialog
    await feedbackManager.showConfirmation(
      ctx,
      '⚠️ Вы уверены, что хотите очистить корзину?\n\nВсе добавленные товары будут удалены.',
      '✅ Да, очистить',
      '❌ Отменить'
    );
    
  } catch (error) {
    await handleErrorWithFeedback(ctx, error, 'cart clearing');
  }
}

/**
 * Обработка оформления заказа
 */
async function handleCheckout(ctx: AuthContext) {
  try {
    await feedbackManager.showLoading(ctx, 'Подготавливаем оформление заказа...');
    
    // Simulate checkout preparation
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await feedbackManager.hideLoading(ctx, 'Переходим к оформлению заказа');
    
    setTimeout(async () => {
      await ctx.scene.enter('checkout');
    }, 500);
    
  } catch (error) {
    await handleErrorWithFeedback(ctx, error, 'checkout preparation');
  }
}

/**
 * Показ улучшенной корзины
 */
async function showEnhancedCart(ctx: AuthContext) {
  try {
    await feedbackManager.showLoading(ctx, 'Загружаем корзину...');
    
    const userId = ctx.from?.id;
    if (!userId) {
      await feedbackManager.hideLoading(ctx);
      await feedbackManager.showError(ctx, 'Не удалось определить пользователя');
      return;
    }

    // Get cart from session or create empty
    const cart = (ctx.session as any)?.cart || { items: [], total: 0 };
    
    await feedbackManager.hideLoading(ctx);

    if (cart.items.length === 0) {
      await feedbackManager.showInfo(
        ctx,
        'Корзина пуста',
        'Добавьте товары из каталога для оформления заказа'
      );
      return;
    }

    // Format cart items
    const cartText = cart.items.map((item: any, index: number) => 
      `${index + 1}. ${item.name}\n   Цена: ${item.price} сум\n   Количество: ${item.quantity}`
    ).join('\n\n');

    const message = `🛒 <b>Ваша корзина</b>\n\n${cartText}\n\n💰 <b>Итого: ${cart.total} сум</b>`;

    const keyboard = Markup.keyboard([
      ['✅ Оформить заказ', '🗑 Очистить корзину'],
      ['🔄 Продолжить покупки', '← Назад']
    ]).resize();

    await ctx.replyWithHTML(message, keyboard);
    
  } catch (error) {
    await handleErrorWithFeedback(ctx, error, 'cart display');
  }
}

// Handle confirmation callbacks
enhancedCategoriesScene.action('confirm_yes', async (ctx) => {
  await ctx.answerCbQuery();
  
  const userId = ctx.from?.id;
  if (userId) {
    // Clear cart
    if (ctx.session) {
      (ctx.session as any).cart = { items: [], total: 0, updatedAt: new Date().toISOString() };
    }
    
    await feedbackManager.showSuccess(ctx, 'Корзина очищена');
    await showEnhancedCart(ctx);
  }
});

enhancedCategoriesScene.action('confirm_no', async (ctx) => {
  await ctx.answerCbQuery();
  await feedbackManager.showInfo(ctx, 'Операция отменена');
});

// Handle help command
enhancedCategoriesScene.command('help', async (ctx) => {
  await feedbackManager.showInfo(
    ctx,
    'Помощь - Категории',
    'Выберите категорию товаров из списка ниже.\n\n' +
    '🛒 - Просмотр корзины\n' +
    '← Назад - Вернуться к предыдущему шагу\n' +
    '/help - Показать эту справку'
  );
});

export { enhancedCategoriesScene }; 