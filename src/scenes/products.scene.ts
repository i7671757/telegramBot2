import { Scenes, Markup } from 'telegraf';
import type { AuthContext } from '../middlewares/auth';
import { fetchProductsByCategory, getProductName, getProductDescription, getProductImageUrl, checkImageAvailability, fetchRelatedProducts } from '../utils/products';
import type { Product } from '../utils/products';
import { registerSceneCommandHandlers, shouldSkipCommand } from '../utils/commandMenu';
const { match } = require("telegraf-i18n");

export const productsScene = new Scenes.BaseScene<AuthContext>('products');

// Регистрируем глобальные обработчики команд для этой сцены
registerSceneCommandHandlers(productsScene, 'Products');

productsScene.enter(async (ctx) => {
  try {
    // Get selected category from session
    const selectedCategory = ctx.session?.selectedCategory;
    
    if (!selectedCategory || !selectedCategory.id) {
      await ctx.reply(ctx.i18n.t('products.no_category') || 'No category selected');
      return ctx.scene.enter('categories');
    }
    
    // Show loading message
    const loadingMessage = await ctx.reply(ctx.i18n.t('loading') || 'Loading...');
    
    // Fetch products from API
    const products = await fetchProductsByCategory(selectedCategory.id);
    
    // Delete loading message
    await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMessage.message_id);
    
    if (!products || products.length === 0) {
      await ctx.reply(
        ctx.i18n.t('products.empty') || 
        'No products available in this category'
      );
      
      // Add back button
      const backButton = Markup.keyboard([
        [ctx.i18n.t('back') || 'Back']
      ]).resize();
      
      await ctx.reply(ctx.i18n.t('choose_action') || 'Choose an action', backButton);
      return;
    }
    
    // Save products in session
    if (!ctx.session) ctx.session = {
      language: 'en',
      registered: false,
      phone: null,
      currentCity: null,
      selectedCity: null
    };
    ctx.session.products = products;
    
    // Get current language
    const language = ctx.i18n.locale();
    
    // Display all products on a single page
    await displayAllProducts(ctx, products, language);
    
  } catch (error) {
    console.error('Error in products scene:', error);
    await ctx.reply(ctx.i18n.t('error') || 'An error occurred. Please try again.');
  }
});

// Function to display all products on a single page
async function displayAllProducts(
  ctx: AuthContext, 
  products: Product[], 
  language: string
) {
  // Create buttons for products
  const productButtons: any[][] = [];
  
  // Add back button and cart button at the top
  const backButtonText = ctx.i18n.t('back') || 'Back';
  const cartButtonText = ctx.i18n.t('cart_button') || 'Cart';
  productButtons.push([backButtonText, cartButtonText]);
  
  // Create product buttons in 2 columns
  const formattedProducts = products.map(product => {
    const name = getProductName(product, language);
    const price = new Intl.NumberFormat('ru-RU').format(product.price);
    return `${name}`;
  });
  
  // Group products in pairs for 2-column layout
  for (let i = 0; i < formattedProducts.length; i += 2) {
    const row = [];
    
    // Add first product in the row
    row.push(formattedProducts[i]);
    
    // Add second product if available
    if (i + 1 < formattedProducts.length) {
      row.push(formattedProducts[i + 1]);
    }
    
    productButtons.push(row);
  }
  
  const keyboard = Markup.keyboard(productButtons).resize();
  
  // Get category name
  const categoryName = ctx.session?.selectedCategory?.attribute_data?.name?.chopar?.[language] || 
                       ctx.session?.selectedCategory?.name || 
                       'Products';
  
  // Show products title
  await ctx.replyWithHTML(
    `${ctx.i18n.t('products.select') || 'Where do we start?'}`,
    keyboard
  );
}

// Function to display related products as buttons
async function showRelatedProducts(
  ctx: AuthContext,
  relatedProducts: Product[],
  language: string
) {
  // Create keyboard buttons for related products
  const buttons: any[][] = [];
  const maxProductsToShow = 4; // Limit to display only a few related products
  
  // Create buttons for each related product (up to the maximum)
  const productsToShow = relatedProducts.slice(0, maxProductsToShow);
  
  console.log(`Displaying ${productsToShow.length} related products`);
  
  for (const product of productsToShow) {
    const productName = getProductName(product, language);
    console.log(`Adding related product button: "${productName}"`);
    
    // Create a button for this product (without price)
    buttons.push([productName]);
  }
  
  // Add a skip button at the bottom
  buttons.push([ctx.i18n.t('skip') || 'Пропустить']);
  
  // Send the related products message with regular keyboard
  await ctx.reply(
    ctx.i18n.t('products.related_products') || 'You might also like:',
    Markup.keyboard(buttons).resize()
  );
}

// Handle add to cart button
productsScene.action(/add_to_cart_(\d+)/, async (ctx) => {
  const productId = ctx.match[1];
  console.log(`Add to cart action for product ID: ${productId}`);
  
  // Ensure session exists
  if (!ctx.session) {
    ctx.session = {
      language: 'en',
      registered: false,
      phone: null,
      currentCity: null,
      selectedCity: null
    };
  }
  
  // Get current quantity for this product
  const safeProductId = String(productId);
  const quantity = ctx.session.productQuantities?.[safeProductId] || 1;
  
  await ctx.answerCbQuery(ctx.i18n.t('products.added_to_cart') || 'Added to cart!');
  
  // Add product to cart with quantity
  const selectedProduct = ctx.session.selectedProduct;
  const language = ctx.i18n.locale();
  const productName = selectedProduct ? getProductName(selectedProduct, language) : '';
  
  if (selectedProduct) {
    const userId = ctx.from?.id;
    if (userId) {
      console.log(`Adding product to cart for user ${userId}: ${productName} (ID: ${selectedProduct.id})`);
      
      // Import cart functions from categories scene
      const { getOrCreateCart, syncCartToSession } = await import('./categories.scene');
      const cart = getOrCreateCart(userId, ctx);
      
      console.log(`Current cart items before adding: ${cart.items.length}`);
      
      // Check if product already exists in cart
      const existingItem = cart.items.find(item => item.id === selectedProduct.id);
      
      if (existingItem) {
        // Update quantity
        console.log(`Product already in cart, updating quantity from ${existingItem.quantity} to ${existingItem.quantity + quantity}`);
        existingItem.quantity += quantity;
      } else {
        // Add new item to cart
        console.log(`Adding new item to cart: ${productName} x${quantity} at ${selectedProduct.price} each`);
        cart.items.push({
          id: selectedProduct.id,
          name: productName,
          price: selectedProduct.price,
          quantity: quantity
        });
      }
      
      // Recalculate total
      cart.total = cart.items.reduce((total, item) => total + (item.price * item.quantity), 0);
      console.log(`Cart updated. Total items: ${cart.items.length}, Total price: ${cart.total}`);
      
      // Sync changes to session
      syncCartToSession(userId, ctx);
    } else {
      console.log('No user ID found, cannot add to cart');
    }
  } else {
    console.log('No selected product found, cannot add to cart');
  }
  
  // Delete the product message (колонка с товаром)
  try {
    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      await ctx.deleteMessage(ctx.callbackQuery.message.message_id);
    }
  } catch (error) {
    console.error('Error deleting product message:', error);
  }
  
  // Show success message with product name using i18n
  await ctx.reply(
    ctx.i18n.t('products.product_added_success', { productName }) || `Product (${productName}) successfully added to cart ✅`
  );

  // Fetch related products
  try {
    // Convert productId string to a number or use as string
    const numericProductId = Number(productId) || productId;
    const relatedProducts = await fetchRelatedProducts(numericProductId);
    
    if (relatedProducts && relatedProducts.length > 0) {
      // Display related products
      await showRelatedProducts(ctx, relatedProducts, language);
    }
  } catch (error) {
    console.error('Error fetching related products:', error);
  }
});

// Type guard function to check if a value is a non-empty string
function isNonEmptyString(value: any): value is string {
  return typeof value === 'string' && value.length > 0;
}

// Helper function to safely split a string
function safeSplit(text: string | undefined, separator: string): string[] {
  return text ? text.split(separator) : [''];
}

// Helper function to safely get first line of text
function getFirstLine(text: string | undefined): string {
  const lines = safeSplit(text, '\n');
  return lines[0] || '';
}

// Handle text messages (product selection)
productsScene.on('text', async (ctx) => {
  // Define messageText with a type assertion
  const messageText = ctx.message.text as string;
  console.log(`Received text in products scene: "${messageText}"`);
  
  // Пропускаем команды - они должны обрабатываться обработчиками команд сцены
  if (shouldSkipCommand(messageText, 'Products')) {
    return;
  }
  
  // Ensure session exists
  if (!ctx.session) {
    ctx.session = {
      language: 'en',
      registered: false,
      phone: null,
      currentCity: null,
      selectedCity: null
    };
  }
  
  // Handle skip button
  if (messageText === ctx.i18n.t('skip') || 
      messageText === 'Пропустить' || 
      messageText === 'Skip' || 
      messageText === 'O\'tkazib yuborish') {
    console.log('Skip button clicked');
    
    // Get current language
    const language = ctx.i18n.locale();
    
    // Get products from session
    const products = ctx.session.products || [];
    
    // Show products with the custom message
    await displayProductsWithCustomMessage(
      ctx, 
      products, 
      language, 
      ctx.i18n.t('products.continue') || 'Продолжим?'
    );
    return;
  }
  
  // Handle clear cart FIRST (before cart button to avoid conflicts)
  if (messageText === ctx.i18n.t('cart.clear') || 
      messageText.includes('🗑') ||
      messageText.includes('Очистить') ||
      messageText.includes('Tozalash')) {
    console.log('Clear cart button pressed in products scene');
    console.log('Message text:', messageText);
    console.log('cart.clear translation:', ctx.i18n.t('cart.clear'));
    
    const userId = ctx.from?.id;
    if (userId) {
      console.log(`Clearing cart for user ${userId}`);
      
      // Import cart functions from categories scene
      const { userCarts, syncCartToSession, getOrCreateCart } = await import('./categories.scene');
      
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
    console.log('Cart button detected in products scene');
    // Set previous scene for back navigation
    ctx.session.previousScene = 'products';
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

  // Handle back button with more specific detection and logging
  if (messageText === ctx.i18n.t('back') || 
      messageText.includes(ctx.i18n.t('back')) ||
      messageText.includes('Orqaga') ||
      messageText.includes('Назад') ||
      messageText.includes('Back')) {
    console.log('Back button detected in products scene, entering categories scene');
    return ctx.scene.enter('categories');
  }
  
  // Get current language
  const language = ctx.i18n.locale();
  
  // First, try to fetch related products to check if the message is a related product
  const selectedProductId = ctx.session.selectedProduct?.id || 0;
  const relatedProducts = await fetchRelatedProducts(selectedProductId);
  
  if (relatedProducts && messageText) {
    // Check if this message matches any related product name exactly
    const selectedRelatedProduct = relatedProducts.find(product => {
      const name = getProductName(product, language);
      return messageText === name;
    });
    
    if (selectedRelatedProduct) {
      // This is a related product selection
      console.log('Related product selected:', messageText);
      
      // Store as the current selected product
      ctx.session.selectedProduct = selectedRelatedProduct;
      
      // Initialize product quantity - always reset to 1 for related product selection
      if (!ctx.session.productQuantities) {
        ctx.session.productQuantities = {};
      }
      
      const safeProductId = String(selectedRelatedProduct.id);
      
      // Always reset quantity to 1 for related products (they are auto-added to cart)
      ctx.session.productQuantities[safeProductId] = 1;
      
      // Get product name for the success message
      const productName = getProductName(selectedRelatedProduct, language);
      
      // Add the product to cart with quantity 1
      console.log(`Auto adding to cart: product ID ${safeProductId}`);
      
      // Actually add the product to cart
      const userId = ctx.from?.id;
      if (userId) {
        console.log(`Adding related product to cart for user ${userId}: ${productName} (ID: ${selectedRelatedProduct.id})`);
        
        // Import cart functions from categories scene
        const { getOrCreateCart, syncCartToSession } = await import('./categories.scene');
        const cart = getOrCreateCart(userId, ctx);
        
        console.log(`Current cart items before adding related product: ${cart.items.length}`);
        
        // Check if product already exists in cart
        const existingItem = cart.items.find(item => item.id === selectedRelatedProduct.id);
        
        if (existingItem) {
          // Update quantity
          console.log(`Related product already in cart, updating quantity from ${existingItem.quantity} to ${existingItem.quantity + 1}`);
          existingItem.quantity += 1;
        } else {
          // Add new item to cart
          console.log(`Adding new related product to cart: ${productName} x1 at ${selectedRelatedProduct.price} each`);
          cart.items.push({
            id: selectedRelatedProduct.id,
            name: productName,
            price: selectedRelatedProduct.price,
            quantity: 1
          });
        }
        
        // Recalculate total
        cart.total = cart.items.reduce((total, item) => total + (item.price * item.quantity), 0);
        console.log(`Cart updated after adding related product. Total items: ${cart.items.length}, Total price: ${cart.total}`);
        
        // Sync changes to session
        syncCartToSession(userId, ctx);
      } else {
        console.log('No user ID found, cannot add related product to cart');
      }
      
      // Show success message with product name using i18n
      await ctx.reply(
        ctx.i18n.t('products.product_added_success', { productName }) || 
        `Product (${productName}) successfully added to cart ✅`
      );
      
      // Return to products display
      await displayProductsWithCustomMessage(
        ctx, 
        ctx.session.products || [], 
        language, 
        ctx.i18n.t('products.continue') || 'Продолжим?'
      );
      
      return;
    }
  }
  
  // Handle regular product selection (original functionality)
  const products = ctx.session.products as Product[] || [];
  
  // Extract product name without emoji and price
  const lines = messageText.split('\n');
  const firstLine = lines[0] || '';
  const productNameWithoutEmoji = firstLine.replace(/^[\p{Emoji}\s]+/u, '').trim();
  
  // Try to find the selected product
  const selectedProduct = products.find(product => {
    const productName = getProductName(product, language);
    return productNameWithoutEmoji === productName || firstLine.includes(productName);
  });
  
  if (selectedProduct) {
    console.log(`Selected product: ${JSON.stringify(selectedProduct)}`);
    // Save selected product in session
    ctx.session.selectedProduct = selectedProduct;
    
    // Initialize product quantity - always reset to 1 for new product selection
    if (!ctx.session.productQuantities) {
      ctx.session.productQuantities = {};
    }
    
    // Use string ID for product
    const safeProductId = String(selectedProduct.id);
    
    // Always reset quantity to 1 when selecting a product (fresh selection)
    ctx.session.productQuantities[safeProductId] = 1;
    
    // Get current quantity for this product (will always be 1 for new selection)
    const currentQuantity = ctx.session.productQuantities[safeProductId];
    
    // Display product info
    const productName = getProductName(selectedProduct, language);
    const productDescription = getProductDescription(selectedProduct, language);
    const productImageUrl = getProductImageUrl(selectedProduct);
    const price = new Intl.NumberFormat('ru-RU').format(selectedProduct.price);
    
    // Strip HTML tags from description
    const cleanDescription = productDescription 
      ? productDescription.replace(/<\/?[^>]+(>|$)/g, "")
      : '';
    
    let message = `<b>${productName}</b>\n\n`;
    if (cleanDescription) {
      message += `${cleanDescription}\n\n`;
    }
    message += `<b>${ctx.i18n.t('products.price') || 'Price'}: ${price} ${ctx.i18n.t('checkout.sum')}</b>`;
    
    // Create an inline keyboard for actions
    const inlineKeyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('-', `decrease_quantity_${selectedProduct.id}`),
        Markup.button.callback(`${currentQuantity}`, `quantity_info_${selectedProduct.id}`),
        Markup.button.callback('+', `increase_quantity_${selectedProduct.id}`)
      ],
      [
        Markup.button.callback(
          ctx.i18n.t('products.add_to_cart') || 'Add to Cart', 
          `add_to_cart_${selectedProduct.id}`
        )
      ],
      // [
      //   Markup.button.callback(
      //     ctx.i18n.t('back') || 'Back', 
      //     'back_to_products'
      //   )
      // ]
    ]);
    
    // Теперь проверим доступность изображения перед отправкой
    let productImage = null;
    if (productImageUrl) {
      const isImageAvailable = await checkImageAvailability(productImageUrl);
      if (isImageAvailable) {
        productImage = productImageUrl;
      } else {
        console.log('Image is not available or not a valid image');
      }
    }
    
    if (productImage) {
      try {
        console.log(`Attempting to send photo: ${productImage}`);
        
        // Используем Input.fromURL для более надежной обработки изображений
        const { Input } = require('telegraf');
        
        // Отправляем изображение с обработкой возможных ошибок
        await ctx.replyWithPhoto(
          Input.fromURL(productImage),
          {
            caption: message,
            parse_mode: 'HTML',
            ...inlineKeyboard
          }
        );
        
        console.log('Photo sent successfully');
      } catch (error) {
        console.error(`Ошибка загрузки изображения для продукта ${selectedProduct.id}:`, error);
        
        // Пробуем отправить просто по URL как запасной вариант
        try {
          await ctx.replyWithPhoto(
            productImage,
            {
              caption: message,
              parse_mode: 'HTML',
              ...inlineKeyboard
            }
          );
          console.log('Photo sent successfully via direct URL');
        } catch (secondError) {
          console.error('Ошибка и при прямой отправке URL, отправляем только текст');
          // Если изображение не удалось загрузить, отправляем только текст
          await ctx.replyWithHTML(message, inlineKeyboard);
        }
      }
    } else {
      await ctx.replyWithHTML(message, inlineKeyboard);
    }
  } else {
    console.log(`Product not found for text: "${productNameWithoutEmoji}"`);
    await ctx.reply(ctx.i18n.t('products.not_found') || 'Product not found');
  }
});

// Handler for increasing quantity button
productsScene.action(/increase_quantity_(\d+)/, async (ctx) => {
  const productId = ctx.match[1];
  console.log(`Increase quantity for product ID: ${productId}`);
  
  // Get current quantity
  if (!ctx.session.productQuantities) {
    ctx.session.productQuantities = {};
  }
  
  const safeProductId = String(productId);
  
  if (!ctx.session.productQuantities[safeProductId]) {
    ctx.session.productQuantities[safeProductId] = 1;
  }
  
  // Increase quantity (with an upper limit of 20)
  if (ctx.session.productQuantities[safeProductId] < 20) {
    ctx.session.productQuantities[safeProductId]++;
  }
  
  await ctx.answerCbQuery();
  
  // Update keyboard with new quantity
  await updateProductWithQuantity(ctx, safeProductId);
});

// Handler for decreasing quantity button
productsScene.action(/decrease_quantity_(\d+)/, async (ctx) => {
  const productId = ctx.match[1];
  console.log(`Decrease quantity for product ID: ${productId}`);
  
  // Get current quantity
  if (!ctx.session.productQuantities) {
    ctx.session.productQuantities = {};
  }
  
  const safeProductId = String(productId);
  
  if (!ctx.session.productQuantities[safeProductId]) {
    ctx.session.productQuantities[safeProductId] = 1;
  }
  
  // Decrease quantity (with a minimum of 1)
  if (ctx.session.productQuantities[safeProductId] > 1) {
    ctx.session.productQuantities[safeProductId]--;
  }
  
  await ctx.answerCbQuery();
  
  // Update keyboard with new quantity
  await updateProductWithQuantity(ctx, safeProductId);
});

// Handler for quantity info button (does nothing except displaying quantity)
productsScene.action(/quantity_info_(\d+)/, async (ctx) => {
  const productId = ctx.match[1];
  const safeProductId = String(productId);
  const quantity = ctx.session.productQuantities?.[safeProductId] || 1;
  
  await ctx.answerCbQuery(`${ctx.i18n.t('products.quantity') || 'Quantity'}: ${quantity}`);
});

// Function to update product display with new quantity
async function updateProductWithQuantity(ctx: AuthContext, productId: string) {
  try {
    // Ensure session exists
    if (!ctx.session) {
      ctx.session = {
        language: 'en',
        registered: false,
        phone: null,
        currentCity: null,
        selectedCity: null
      };
    }
    
    // Get selected product from session
    const selectedProduct = ctx.session.selectedProduct;
    if (!selectedProduct) return;
    
    // Ensure productQuantities exists
    if (!ctx.session.productQuantities) {
      ctx.session.productQuantities = {};
    }
    
    // Get current quantity
    const currentQuantity = ctx.session.productQuantities[productId] || 1;
    
    // Get current language
    const language = ctx.i18n.locale();
    
    // Calculate total price based on quantity
    const unitPrice = Number(selectedProduct.price);
    const totalPrice = unitPrice * currentQuantity;
    
    // Format prices
    const formattedUnitPrice = new Intl.NumberFormat('ru-RU').format(unitPrice);
    const formattedTotalPrice = new Intl.NumberFormat('ru-RU').format(totalPrice);
    
    // Get product info
    const productName = getProductName(selectedProduct, language);
    const productDescription = getProductDescription(selectedProduct, language);
    
    // Strip HTML tags from description
    const cleanDescription = productDescription 
      ? productDescription.replace(/<\/?[^>]+(>|$)/g, "")
      : '';
    
    // Create message with updated price information
    let message = `<b>${productName}</b>\n\n`;
    if (cleanDescription) {
      message += `${cleanDescription}\n\n`;
    }
    
    // Показываем только итоговую цену без формулы
    message += `<b>${ctx.i18n.t('products.price') || 'Price'}: ${formattedTotalPrice} ${ctx.i18n.t('checkout.sum')}</b>`;
    
    // Create an inline keyboard with updated quantity
    const inlineKeyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('-', `decrease_quantity_${productId}`),
        Markup.button.callback(`${currentQuantity}`, `quantity_info_${productId}`),
        Markup.button.callback('+', `increase_quantity_${productId}`)
      ],
      [
        Markup.button.callback(
          ctx.i18n.t('products.add_to_cart') || 'Add to Cart', 
          `add_to_cart_${productId}`
        )
      ]
    ]);
    
    // Edit the message with updated price and keyboard
    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      // For messages with images
      if ('photo' in ctx.callbackQuery.message) {
        await ctx.editMessageCaption(message, {
          parse_mode: 'HTML',
          reply_markup: inlineKeyboard.reply_markup
        });
      } 
      // For text-only messages
      else {
        await ctx.editMessageText(message, {
          parse_mode: 'HTML',
          reply_markup: inlineKeyboard.reply_markup
        });
      }
    }
  } catch (error) {
    console.error('Error updating product keyboard:', error);
  }
}

// Handle back button callback
productsScene.action('back_to_products', async (ctx) => {
  console.log('Back to products button clicked');
  await ctx.answerCbQuery();
  
  // Get current language
  const language = ctx.i18n.locale();
  
  // Display all products again
  await displayAllProducts(ctx, ctx.session?.products || [], language);
});

// Additional handler for the general 'back' action
productsScene.action('back', async (ctx) => {
  console.log('Back action received');
  await ctx.answerCbQuery();
  return ctx.scene.enter('categories');
});

// Nazad / Back button callback handler
productsScene.action(/назад|back|orqaga/i, async (ctx) => {
  console.log('Назад button callback received');
  await ctx.answerCbQuery();
  return ctx.scene.enter('categories');
});

// Function to display products with a custom message
async function displayProductsWithCustomMessage(
  ctx: AuthContext, 
  products: Product[], 
  language: string,
  message: string
) {
  // Create buttons for products
  const productButtons: any[][] = [];
  
  // Add back button and cart button at the top
  const backButtonText = ctx.i18n.t('back') || 'Back';
  const cartButtonText = ctx.i18n.t('cart_button') || 'Cart';
  productButtons.push([backButtonText, cartButtonText]);
  
  // Create product buttons in 2 columns
  const formattedProducts: string[] = [];
  
  // Process each product safely
  for (const product of products) {
    if (product) {
      const name = getProductName(product, language);
      formattedProducts.push(name);
    }
  }
  
  // Group products in pairs for 2-column layout
  for (let i = 0; i < formattedProducts.length; i += 2) {
    const row = [];
    
    // Add first product in the row
    row.push(formattedProducts[i]);
    
    // Add second product if available
    if (i + 1 < formattedProducts.length) {
      row.push(formattedProducts[i + 1]);
    }
    
    productButtons.push(row);
  }
  
  const keyboard = Markup.keyboard(productButtons).resize();
  
  // Show products with the custom message
  await ctx.replyWithHTML(message, keyboard);
} 


productsScene.hears(match('feedback.review'), async (ctx) => {
  // Enter the review scene
  await ctx.scene.enter('review');
});

productsScene.hears(match('feedback.back'), async (ctx) => {
  await ctx.scene.enter('mainMenu');
});

productsScene.command('feedback', async (ctx) => {
console.log('Feedback command received in callback scene, reloading the scene');
await ctx.scene.reenter(); // Reenter the same scene to reset it
});

// Add a start command handler
productsScene.command('start', async (ctx) => {
console.log('Callback scene: /start command received, restarting bot');

// Exit the current scene
await ctx.scene.leave();

// Send a restart message
await ctx.reply(ctx.i18n.t('bot_restarted') || 'Bot has been restarted. Starting from the beginning...');

// Go to the start scene (formerly language scene)
return ctx.scene.enter('start');
});

// Show cart contents
async function showCart(ctx: AuthContext) {
  try {
    console.log('showCart function called in products scene');
    const userId = ctx.from?.id;
    if (!userId) {
      console.log('No user ID found in showCart');
      await ctx.reply(ctx.i18n.t('error') || 'User ID not found');
      return;
    }

    console.log(`Showing cart for user ${userId}`);
    
    // Import cart functions from categories scene
    const { getOrCreateCart } = await import('./categories.scene');
    const cart = getOrCreateCart(userId, ctx);

    console.log(`Cart has ${cart.items.length} items`);

    if (cart.items.length === 0) {
      console.log('Cart is empty, showing empty message');
      await ctx.reply(
        ctx.i18n.t('cart.empty') || 'Ваша корзина пуста',
        Markup.keyboard([
          [ctx.i18n.t('back') || '⬅️ Назад']
        ]).resize()
      );
      return;
    }

    // Build cart message with numbered items
    let cartMessage = `🛒 <b>${ctx.i18n.t('cart.title') || 'Ваша корзина'}:</b>\n\n`;

    // Create inline keyboard for each item
    const inlineButtons: any[][] = [];

    cart.items.forEach((cartItem, index) => {
      const itemTotal = cartItem.price * cartItem.quantity;
      const formattedItemTotal = new Intl.NumberFormat('ru-RU').format(itemTotal);
      cartMessage += `${index + 1}. ${cartItem.name}\n${cartItem.quantity} × ${new Intl.NumberFormat('ru-RU').format(cartItem.price)} = ${formattedItemTotal} ${ctx.i18n.t('checkout.sum')}\n\n`;
      
      // Create inline buttons for this item: [❌] [1] [-] [+]
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
    cartMessage += `<b>${ctx.i18n.t('cart.total') || 'Итого'}: ${formattedTotal} ${ctx.i18n.t('checkout.sum')}</b>`;

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

    // Import cart functions from categories scene
    const { getOrCreateCart } = await import('./categories.scene');
    const cart = getOrCreateCart(userId, ctx);

    if (cart.items.length === 0) {
      // If cart is empty, delete the message and show empty cart
      try {
        await ctx.deleteMessage();
      } catch (error) {
        console.error('Error deleting message:', error);
      }
      await showCart(ctx);
      return;
    }

    // Build cart message with numbered items
    let cartMessage = `🛒 <b>${ctx.i18n.t('cart.title') || 'Ваша корзина'}:</b>\n\n`;

    // Create inline keyboard for each item
    const inlineButtons: any[][] = [];

    cart.items.forEach((cartItem, index) => {
      const itemTotal = cartItem.price * cartItem.quantity;
      const formattedItemTotal = new Intl.NumberFormat('ru-RU').format(itemTotal);
      cartMessage += `${index + 1}. ${cartItem.name}\n${cartItem.quantity} × ${new Intl.NumberFormat('ru-RU').format(cartItem.price)} = ${formattedItemTotal} ${ctx.i18n.t('checkout.sum')}\n\n`;
      
      // Create inline buttons for this item: [❌] [1] [-] [+]
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
    cartMessage += `<b>${ctx.i18n.t('cart.total') || 'Итого'}: ${formattedTotal} ${ctx.i18n.t('checkout.sum')}</b>`;

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
productsScene.action(/remove_item_(\d+)/, async (ctx) => {
  const itemId = parseInt(ctx.match[1]);
  console.log(`Remove item ${itemId} from cart`);
  
  const userId = ctx.from?.id;
  if (!userId) return;
  
  // Import cart functions from categories scene
  const { getOrCreateCart, syncCartToSession } = await import('./categories.scene');
  const cart = getOrCreateCart(userId, ctx);
  
  // Remove item from cart
  cart.items = cart.items.filter(item => item.id !== itemId);
  
  // Recalculate total
  cart.total = cart.items.reduce((total, item) => total + (item.price * item.quantity), 0);
  
  // Sync changes to session
  syncCartToSession(userId, ctx);
  
  await ctx.answerCbQuery(ctx.i18n.t('cart.item_removed') || 'Товар удален из корзины');
  
  // Update cart message instead of recreating it
  await updateCartMessage(ctx);
});

productsScene.action(/increase_cart_(\d+)/, async (ctx) => {
  const itemId = parseInt(ctx.match[1]);
  console.log(`Increase quantity for item ${itemId} in cart`);
  
  const userId = ctx.from?.id;
  if (!userId) return;
  
  // Import cart functions from categories scene
  const { getOrCreateCart, syncCartToSession } = await import('./categories.scene');
  const cart = getOrCreateCart(userId, ctx);
  
  // Find and increase quantity
  const item = cart.items.find(item => item.id === itemId);
  if (item && item.quantity < 20) {
    item.quantity++;
    
    // Recalculate total
    cart.total = cart.items.reduce((total, item) => total + (item.price * item.quantity), 0);
    
    // Sync changes to session
    syncCartToSession(userId, ctx);
    
    await ctx.answerCbQuery();
    
    // Update cart message instead of recreating it
    await updateCartMessage(ctx);
  } else {
    await ctx.answerCbQuery(ctx.i18n.t('cart.max_quantity') || 'Максимальное количество: 20');
  }
});

productsScene.action(/decrease_cart_(\d+)/, async (ctx) => {
  const itemId = parseInt(ctx.match[1]);
  console.log(`Decrease quantity for item ${itemId} in cart`);
  
  const userId = ctx.from?.id;
  if (!userId) return;
  
  // Import cart functions from categories scene
  const { getOrCreateCart, syncCartToSession } = await import('./categories.scene');
  const cart = getOrCreateCart(userId, ctx);
  
  // Find and decrease quantity
  const item = cart.items.find(item => item.id === itemId);
  if (item) {
    if (item.quantity > 1) {
      item.quantity--;
      
      // Recalculate total
      cart.total = cart.items.reduce((total, item) => total + (item.price * item.quantity), 0);
      
      // Sync changes to session
      syncCartToSession(userId, ctx);
      
      await ctx.answerCbQuery();
      
      // Update cart message instead of recreating it
      await updateCartMessage(ctx);
    } else {
      // If quantity is 1, remove the item
      cart.items = cart.items.filter(item => item.id !== itemId);
      
      // Recalculate total
      cart.total = cart.items.reduce((total, item) => total + (item.price * item.quantity), 0);
      
      // Sync changes to session
      syncCartToSession(userId, ctx);
      
      await ctx.answerCbQuery(ctx.i18n.t('cart.item_removed') || 'Товар удален из корзины');
      
      // Update cart message instead of recreating it
      await updateCartMessage(ctx);
    }
  }
});

productsScene.action(/item_quantity_(\d+)/, async (ctx) => {
  const itemId = parseInt(ctx.match[1]);
  const userId = ctx.from?.id;
  if (!userId) return;
  
  // Import cart functions from categories scene
  const { getOrCreateCart } = await import('./categories.scene');
  const cart = getOrCreateCart(userId, ctx);
  const item = cart.items.find(item => item.id === itemId);
  
  if (item) {
    await ctx.answerCbQuery(`${ctx.i18n.t('products.quantity') || 'Количество'}: ${item.quantity}`);
  }
});

 

