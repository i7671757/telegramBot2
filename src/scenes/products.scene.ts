import { Scenes, Markup } from 'telegraf';
import type { MyContext } from '../config/context';
import { fetchProductsByCategory, getProductName, getProductDescription, getProductImageUrl, checkImageAvailability, fetchRelatedProducts } from '../utils/products';
import type { Product } from '../utils/products';

export const productsScene = new Scenes.BaseScene<MyContext>('products');

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
    if (!ctx.session) ctx.session = {};
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
  ctx: MyContext, 
  products: Product[], 
  language: string
) {
  // Create buttons for products
  const productButtons: any[][] = [];
  
  // Add back button at the top
  productButtons.push([ctx.i18n.t('back') || 'Back']);
  
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
  ctx: MyContext,
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
    ctx.session = {};
  }
  
  // Get current quantity for this product
  const safeProductId = String(productId);
  const quantity = ctx.session.productQuantities?.[safeProductId] || 1;
  
  await ctx.answerCbQuery(ctx.i18n.t('products.added_to_cart') || 'Added to cart!');
  
  // Here you would implement adding the product to cart with quantity
  // Get product name
  const selectedProduct = ctx.session.selectedProduct;
  const language = ctx.i18n.locale();
  const productName = selectedProduct ? getProductName(selectedProduct, language) : '';
  
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
  
  // Ensure session exists
  if (!ctx.session) {
    ctx.session = {};
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
      
      // Initialize product quantity
      if (!ctx.session.productQuantities) {
        ctx.session.productQuantities = {};
      }
      
      const safeProductId = String(selectedRelatedProduct.id);
      
      if (!ctx.session.productQuantities[safeProductId]) {
        ctx.session.productQuantities[safeProductId] = 1;
      }
      
      // Get product name for the success message
      const productName = getProductName(selectedRelatedProduct, language);
      
      // Add the product to cart with quantity 1
      // In a real app, this would update a cart data structure
      // For this bot, simply storing the product in session is sufficient
      
      // Simulate adding to cart action
      console.log(`Auto adding to cart: product ID ${safeProductId}`);
      
      // This would be where you'd update any cart total or add to a cart array
      // For demonstration, we'll just show the success message as if it was added
      
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
    
    // Initialize product quantity if not set
    if (!ctx.session.productQuantities) {
      ctx.session.productQuantities = {};
    }
    
    // Use string ID for product
    const safeProductId = String(selectedProduct.id);
    
    if (!ctx.session.productQuantities[safeProductId]) {
      ctx.session.productQuantities[safeProductId] = 1;
    }
    
    // Get current quantity for this product
    const currentQuantity = ctx.session.productQuantities[safeProductId] || 1;
    
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
    message += `<b>${ctx.i18n.t('products.price') || 'Price'}: ${price} сум</b>`;
    
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
async function updateProductWithQuantity(ctx: MyContext, productId: string) {
  try {
    // Ensure session exists
    if (!ctx.session) {
      ctx.session = {};
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
    message += `<b>${ctx.i18n.t('products.price') || 'Price'}: ${formattedTotalPrice} сум</b>`;
    
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
  ctx: MyContext, 
  products: Product[], 
  language: string,
  message: string
) {
  // Create buttons for products
  const productButtons: any[][] = [];
  
  // Add back button at the top
  productButtons.push([ctx.i18n.t('back') || 'Back']);
  
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