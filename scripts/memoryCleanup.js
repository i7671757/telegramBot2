#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Скрипт для очистки памяти и оптимизации сессий
 */

const SESSIONS_FILE = path.join(__dirname, '..', 'sessions.json');
const BACKUP_DIR = path.join(__dirname, '..', 'backups');

// Настройки очистки
const CONFIG = {
  maxSessionAge: 7 * 24 * 60 * 60 * 1000, // 7 дней
  maxInactiveAge: 24 * 60 * 60 * 1000, // 24 часа
  sessionSizeThreshold: 100 * 1024, // 100KB
  maxProductQuantities: 50,
  maxCartItems: 20
};

/**
 * Создание резервной копии
 */
function createBackup() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUP_DIR, `sessions_backup_${timestamp}.json`);
  
  if (fs.existsSync(SESSIONS_FILE)) {
    fs.copyFileSync(SESSIONS_FILE, backupFile);
    console.log(`✅ Backup created: ${backupFile}`);
    return backupFile;
  }
  
  return null;
}

/**
 * Получение времени последней активности
 */
function getLastActivity(session) {
  const timestamps = [];
  
  if (session.cart?.updatedAt) {
    timestamps.push(new Date(session.cart.updatedAt).getTime());
  }
  
  if (session.lastOtpSent) {
    timestamps.push(session.lastOtpSent);
  }

  return timestamps.length > 0 ? Math.max(...timestamps) : Date.now() - CONFIG.maxSessionAge;
}

/**
 * Оптимизация сессии
 */
function optimizeSession(session) {
  const originalSize = Buffer.byteLength(JSON.stringify(session), 'utf8');
  const optimized = { ...session };
  const removedFields = [];

  // Удаляем большие временные объекты
  if (optimized.products) {
    delete optimized.products;
    removedFields.push('products');
  }

  // Упрощаем selectedProduct
  if (optimized.selectedProduct) {
    const product = optimized.selectedProduct;
    optimized.selectedProduct = {
      id: product.id,
      name: product.custom_name || product.attribute_data?.name?.chopar?.ru,
      price: product.price
    };
    removedFields.push('selectedProduct.details');
  }

  // Упрощаем selectedCategory
  if (optimized.selectedCategory) {
    const category = optimized.selectedCategory;
    optimized.selectedCategory = {
      id: category.id,
      name: category.attribute_data?.name?.chopar?.ru,
      icon: category.icon
    };
    removedFields.push('selectedCategory.details');
  }

  // Ограничиваем productQuantities
  if (optimized.productQuantities) {
    const quantities = optimized.productQuantities;
    const quantityCount = Object.keys(quantities).length;
    if (quantityCount > CONFIG.maxProductQuantities) {
      const entries = Object.entries(quantities);
      const recent = entries.slice(-20);
      optimized.productQuantities = Object.fromEntries(recent);
      removedFields.push('productQuantities.old');
    }
  }

  // Удаляем временные поля
  const temporaryFields = [
    'expectingTimeSlotSelection',
    'expectingAdditionalPhone', 
    'expectingCutleryChoice',
    'expectingOrderConfirmation',
    'step',
    'previousScene',
    '__scenes'
  ];

  temporaryFields.forEach(field => {
    if (optimized[field] !== undefined) {
      delete optimized[field];
      removedFields.push(field);
    }
  });

  // Оптимизируем корзину
  if (optimized.cart?.items) {
    if (optimized.cart.items.length > CONFIG.maxCartItems) {
      optimized.cart.items = optimized.cart.items.slice(-CONFIG.maxCartItems);
      removedFields.push('cart.oldItems');
    }
    
    optimized.cart.items = optimized.cart.items.map(item => ({
      id: item.id,
      name: item.name,
      price: item.price,
      quantity: item.quantity
    }));
  }

  const optimizedSize = Buffer.byteLength(JSON.stringify(optimized), 'utf8');
  const compressionRatio = ((originalSize - optimizedSize) / originalSize) * 100;

  return {
    session: optimized,
    originalSize,
    optimizedSize,
    compressionRatio,
    removedFields
  };
}

/**
 * Анализ сессий
 */
function analyzeSessions(sessions) {
  const stats = {
    total: sessions.length,
    totalSize: 0,
    largeSessionsCount: 0,
    oldSessionsCount: 0,
    inactiveSessionsCount: 0,
    averageSize: 0,
    largestSize: 0
  };

  const now = Date.now();

  sessions.forEach(sessionData => {
    const sessionSize = Buffer.byteLength(JSON.stringify(sessionData.data), 'utf8');
    stats.totalSize += sessionSize;
    stats.largestSize = Math.max(stats.largestSize, sessionSize);

    if (sessionSize > CONFIG.sessionSizeThreshold) {
      stats.largeSessionsCount++;
    }

    const lastActivity = getLastActivity(sessionData.data);
    const sessionAge = now - lastActivity;
    const inactiveTime = now - lastActivity;

    if (sessionAge > CONFIG.maxSessionAge) {
      stats.oldSessionsCount++;
    }

    if (inactiveTime > CONFIG.maxInactiveAge) {
      stats.inactiveSessionsCount++;
    }
  });

  stats.averageSize = stats.total > 0 ? stats.totalSize / stats.total : 0;

  return stats;
}

/**
 * Основная функция очистки
 */
async function performCleanup() {
  console.log('🧹 Starting memory cleanup...\n');

  // Проверяем существование файла сессий
  if (!fs.existsSync(SESSIONS_FILE)) {
    console.log('❌ Sessions file not found');
    return;
  }

  // Создаем резервную копию
  const backupFile = createBackup();
  if (!backupFile) {
    console.log('❌ Failed to create backup');
    return;
  }

  try {
    // Читаем сессии
    const sessionsData = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    const sessions = sessionsData.sessions || [];

    console.log(`📊 Initial analysis:`);
    const initialStats = analyzeSessions(sessions);
    console.log(`   Total sessions: ${initialStats.total}`);
    console.log(`   Total size: ${(initialStats.totalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Average size: ${(initialStats.averageSize / 1024).toFixed(2)} KB`);
    console.log(`   Large sessions: ${initialStats.largeSessionsCount}`);
    console.log(`   Old sessions: ${initialStats.oldSessionsCount}`);
    console.log(`   Inactive sessions: ${initialStats.inactiveSessionsCount}\n`);

    const now = Date.now();
    const cleanedSessions = [];
    let optimizedCount = 0;
    let removedCount = 0;
    let totalMemorySaved = 0;

    // Обрабатываем каждую сессию
    for (const sessionData of sessions) {
      const lastActivity = getLastActivity(sessionData.data);
      const sessionAge = now - lastActivity;
      const inactiveTime = now - lastActivity;

      // Удаляем очень старые сессии
      if (sessionAge > CONFIG.maxSessionAge) {
        removedCount++;
        console.log(`🗑️  Removed old session: ${sessionData.id} (age: ${Math.floor(sessionAge / (24 * 60 * 60 * 1000))} days)`);
        continue;
      }

      // Удаляем неактивные сессии
      if (inactiveTime > CONFIG.maxInactiveAge) {
        removedCount++;
        console.log(`🗑️  Removed inactive session: ${sessionData.id} (inactive: ${Math.floor(inactiveTime / (60 * 60 * 1000))} hours)`);
        continue;
      }

      // Проверяем размер сессии
      const sessionSize = Buffer.byteLength(JSON.stringify(sessionData.data), 'utf8');
      
      if (sessionSize > CONFIG.sessionSizeThreshold) {
        // Оптимизируем большую сессию
        const optimization = optimizeSession(sessionData.data);
        
        if (optimization.compressionRatio > 10) {
          cleanedSessions.push({
            id: sessionData.id,
            data: optimization.session
          });
          
          optimizedCount++;
          totalMemorySaved += optimization.originalSize - optimization.optimizedSize;
          
          console.log(`🔧 Optimized session: ${sessionData.id}`);
          console.log(`   Size: ${(optimization.originalSize / 1024).toFixed(2)} KB -> ${(optimization.optimizedSize / 1024).toFixed(2)} KB`);
          console.log(`   Compression: ${optimization.compressionRatio.toFixed(2)}%`);
          console.log(`   Removed: ${optimization.removedFields.join(', ')}`);
        } else {
          cleanedSessions.push(sessionData);
        }
      } else {
        cleanedSessions.push(sessionData);
      }
    }

    // Сохраняем очищенные сессии
    const cleanedData = {
      ...sessionsData,
      sessions: cleanedSessions
    };

    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(cleanedData, null, 2));

    // Финальная статистика
    console.log(`\n✅ Cleanup completed!`);
    console.log(`📈 Results:`);
    console.log(`   Sessions removed: ${removedCount}`);
    console.log(`   Sessions optimized: ${optimizedCount}`);
    console.log(`   Memory saved: ${(totalMemorySaved / 1024 / 1024).toFixed(2)} MB`);
    
    const finalStats = analyzeSessions(cleanedSessions);
    console.log(`   Final sessions count: ${finalStats.total}`);
    console.log(`   Final total size: ${(finalStats.totalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Size reduction: ${(((initialStats.totalSize - finalStats.totalSize) / initialStats.totalSize) * 100).toFixed(2)}%`);

    // Проверяем результат
    if (finalStats.largeSessionsCount === 0 && finalStats.oldSessionsCount === 0) {
      console.log(`\n🎉 All sessions are now optimized!`);
    } else {
      console.log(`\n⚠️  Still have ${finalStats.largeSessionsCount} large sessions and ${finalStats.oldSessionsCount} old sessions`);
    }

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    
    // Восстанавливаем из резервной копии
    if (backupFile && fs.existsSync(backupFile)) {
      console.log('🔄 Restoring from backup...');
      fs.copyFileSync(backupFile, SESSIONS_FILE);
      console.log('✅ Backup restored');
    }
  }
}

/**
 * Анализ без очистки
 */
function analyzeOnly() {
  console.log('📊 Analyzing sessions...\n');

  if (!fs.existsSync(SESSIONS_FILE)) {
    console.log('❌ Sessions file not found');
    return;
  }

  try {
    const sessionsData = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    const sessions = sessionsData.sessions || [];

    const stats = analyzeSessions(sessions);
    
    console.log(`📈 Session Statistics:`);
    console.log(`   Total sessions: ${stats.total}`);
    console.log(`   Total memory usage: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Average session size: ${(stats.averageSize / 1024).toFixed(2)} KB`);
    console.log(`   Largest session size: ${(stats.largestSize / 1024).toFixed(2)} KB`);
    console.log(`   Large sessions (>${(CONFIG.sessionSizeThreshold / 1024).toFixed(0)}KB): ${stats.largeSessionsCount}`);
    console.log(`   Old sessions (>7 days): ${stats.oldSessionsCount}`);
    console.log(`   Inactive sessions (>24h): ${stats.inactiveSessionsCount}`);

    // Рекомендации
    console.log(`\n💡 Recommendations:`);
    if (stats.largeSessionsCount > 0) {
      console.log(`   - Optimize ${stats.largeSessionsCount} large sessions`);
    }
    if (stats.oldSessionsCount > 0) {
      console.log(`   - Remove ${stats.oldSessionsCount} old sessions`);
    }
    if (stats.inactiveSessionsCount > 0) {
      console.log(`   - Remove ${stats.inactiveSessionsCount} inactive sessions`);
    }
    
    const potentialSavings = (stats.largeSessionsCount * CONFIG.sessionSizeThreshold * 0.7) + 
                           (stats.oldSessionsCount * stats.averageSize) + 
                           (stats.inactiveSessionsCount * stats.averageSize);
    
    if (potentialSavings > 0) {
      console.log(`   - Potential memory savings: ${(potentialSavings / 1024 / 1024).toFixed(2)} MB`);
    }

  } catch (error) {
    console.error('❌ Error during analysis:', error);
  }
}

// Обработка аргументов командной строки
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'analyze':
    analyzeOnly();
    break;
  case 'cleanup':
  default:
    performCleanup();
    break;
} 