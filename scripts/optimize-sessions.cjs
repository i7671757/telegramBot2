const fs = require('fs');
const path = require('path');

/**
 * Оптимизация файла sessions.json
 * Удаляет избыточные данные и сжимает структуру
 */
class SessionsOptimizer {
  constructor(inputFile = 'sessions.json', outputFile = 'sessions_optimized.json') {
    this.inputFile = inputFile;
    this.outputFile = outputFile;
  }

  /**
   * Удаляет null и undefined значения из объекта
   */
  removeNullValues(obj) {
    if (Array.isArray(obj)) {
      return obj.map(item => this.removeNullValues(item));
    }
    
    if (obj !== null && typeof obj === 'object') {
      const cleaned = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== null && value !== undefined && value !== '') {
          cleaned[key] = this.removeNullValues(value);
        }
      }
      return cleaned;
    }
    
    return obj;
  }

  /**
   * Оптимизирует структуру продукта
   */
  optimizeProduct(product) {
    const optimized = {
      id: product.id,
      name: this.extractMultiLangText(product.attribute_data?.name?.chopar),
      description: this.extractMultiLangText(product.attribute_data?.description?.chopar, true),
      price: parseFloat(product.price),
      category_id: product.category_id,
      image: product.image,
      sort: product.sort
    };

    // Добавляем вес только если он есть и больше 0
    if (product.weight && product.weight > 0) {
      optimized.weight = product.weight;
    }

    return this.removeNullValues(optimized);
  }

  /**
   * Извлекает многоязычный текст
   */
  extractMultiLangText(textObj, isDescription = false) {
    if (!textObj) return null;
    
    const result = {};
    for (const [lang, text] of Object.entries(textObj)) {
      if (text && text.trim()) {
        // Для описаний удаляем HTML теги
        result[lang] = isDescription ? text.replace(/<[^>]*>/g, '').trim() : text.trim();
      }
    }
    
    return Object.keys(result).length > 0 ? result : null;
  }

  /**
   * Оптимизирует категорию
   */
  optimizeCategory(category) {
    if (!category) return null;
    
    return this.removeNullValues({
      id: category.id,
      name: this.extractMultiLangText(category.attribute_data?.name?.chopar),
      order: category.order,
      icon: category.icon
    });
  }

  /**
   * Оптимизирует выбранный продукт
   */
  optimizeSelectedProduct(product) {
    if (!product) return null;
    
    return this.removeNullValues({
      id: product.id,
      name: this.extractMultiLangText(product.attribute_data?.name?.chopar),
      price: parseFloat(product.price),
      weight: product.weight > 0 ? product.weight : undefined,
      image: product.image
    });
  }

  /**
   * Оптимизирует корзину
   */
  optimizeCart(cart) {
    if (!cart) return null;
    
    return {
      items: cart.items?.map(item => ({
        id: item.id,
        name: item.name,
        price: typeof item.price === 'string' ? parseFloat(item.price) : item.price,
        quantity: item.quantity
      })) || [],
      total: cart.total,
      updatedAt: cart.updatedAt
    };
  }

  /**
   * Оптимизирует данные сессии
   */
  optimizeSessionData(data) {
    const optimized = {
      __scenes: data.__scenes,
      language: data.language,
      registered: data.registered,
      phone: data.phone,
      currentCity: data.currentCity,
      __language_code: data.__language_code,
      selectedCity: data.selectedCity,
      isAuthenticated: data.isAuthenticated
    };

    // Добавляем адрес и координаты только если они есть
    if (data.address) optimized.address = data.address;
    if (data.coordinates) optimized.coordinates = data.coordinates;
    if (data.previousScene) optimized.previousScene = data.previousScene;

    // Оптимизируем продукты
    if (data.products && Array.isArray(data.products)) {
      optimized.products = data.products.map(product => this.optimizeProduct(product));
    }

    // Оптимизируем выбранный продукт
    if (data.selectedProduct) {
      optimized.selectedProduct = this.optimizeSelectedProduct(data.selectedProduct);
    }

    // Добавляем остальные важные поля
    if (data.productQuantities) optimized.productQuantities = data.productQuantities;
    if (data.cart) optimized.cart = this.optimizeCart(data.cart);
    
    // Добавляем настройки заказа
    const orderFields = [
      'expectingTimeSlotSelection', 'selectedPickupTime', 'selectedPaymentMethod',
      'expectingAdditionalPhone', 'additionalPhone', 'expectingCutleryChoice',
      'includeCutlery', 'expectingOrderConfirmation', 'ratings', 'selectedBranch',
      'deliveryType', 'step'
    ];
    
    orderFields.forEach(field => {
      if (data[field] !== undefined) {
        optimized[field] = data[field];
      }
    });

    // Оптимизируем выбранную категорию
    if (data.selectedCategory) {
      optimized.selectedCategory = this.optimizeCategory(data.selectedCategory);
    }

    return this.removeNullValues(optimized);
  }

  /**
   * Основная функция оптимизации
   */
  optimize() {
    try {
      console.log(`📖 Читаем файл: ${this.inputFile}`);
      const data = JSON.parse(fs.readFileSync(this.inputFile, 'utf8'));
      
      const originalSize = fs.statSync(this.inputFile).size;
      console.log(`📊 Исходный размер: ${(originalSize / 1024).toFixed(2)} KB`);

      const optimized = {
        language: data.language,
        registered: data.registered,
        phone: data.phone,
        currentCity: data.currentCity,
        selectedCity: data.selectedCity,
        sessions: data.sessions.map(session => ({
          id: session.id,
          data: this.optimizeSessionData(session.data)
        }))
      };

      // Удаляем пустые значения из корневого объекта
      const finalOptimized = this.removeNullValues(optimized);

      console.log(`💾 Сохраняем оптимизированный файл: ${this.outputFile}`);
      fs.writeFileSync(this.outputFile, JSON.stringify(finalOptimized, null, 2));
      
      const newSize = fs.statSync(this.outputFile).size;
      const reduction = ((originalSize - newSize) / originalSize * 100).toFixed(2);
      
      console.log(`📊 Новый размер: ${(newSize / 1024).toFixed(2)} KB`);
      console.log(`🎯 Сжатие: ${reduction}%`);
      console.log(`✅ Оптимизация завершена!`);

      return {
        originalSize,
        newSize,
        reduction: parseFloat(reduction)
      };
    } catch (error) {
      console.error('❌ Ошибка при оптимизации:', error.message);
      throw error;
    }
  }

  /**
   * Создает резервную копию
   */
  createBackup() {
    const backupFile = `${this.inputFile}.backup.${Date.now()}`;
    fs.copyFileSync(this.inputFile, backupFile);
    console.log(`💾 Создана резервная копия: ${backupFile}`);
    return backupFile;
  }

  /**
   * Валидация оптимизированного файла
   */
  validate() {
    try {
      const original = JSON.parse(fs.readFileSync(this.inputFile, 'utf8'));
      const optimized = JSON.parse(fs.readFileSync(this.outputFile, 'utf8'));
      
      console.log('🔍 Проверка целостности данных...');
      
      // Проверяем количество сессий
      if (original.sessions.length !== optimized.sessions.length) {
        throw new Error('Количество сессий не совпадает');
      }
      
      // Проверяем ID сессий
      const originalIds = original.sessions.map(s => s.id).sort();
      const optimizedIds = optimized.sessions.map(s => s.id).sort();
      
      if (JSON.stringify(originalIds) !== JSON.stringify(optimizedIds)) {
        throw new Error('ID сессий не совпадают');
      }
      
      console.log('✅ Валидация прошла успешно');
      return true;
    } catch (error) {
      console.error('❌ Ошибка валидации:', error.message);
      return false;
    }
  }
}

// Запуск оптимизации если файл запущен напрямую
if (require.main === module) {
  const optimizer = new SessionsOptimizer();
  
  // Создаем резервную копию
  optimizer.createBackup();
  
  // Оптимизируем
  const result = optimizer.optimize();
  
  // Валидируем
  optimizer.validate();
  
  console.log('\n📈 Статистика оптимизации:');
  console.log(`- Исходный размер: ${(result.originalSize / 1024).toFixed(2)} KB`);
  console.log(`- Новый размер: ${(result.newSize / 1024).toFixed(2)} KB`);
  console.log(`- Экономия: ${result.reduction}%`);
}

module.exports = SessionsOptimizer; 