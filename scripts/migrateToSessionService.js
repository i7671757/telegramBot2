#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Скрипт для миграции существующих сессий на новую систему SessionService
 */

const SESSIONS_FILE = './sessions.json';
const BACKUP_FILE = './sessions_backup.json';

async function migrateSessions() {
  console.log('🔄 Начинаем миграцию сессий...');

  try {
    // Проверяем существование файла сессий
    if (!fs.existsSync(SESSIONS_FILE)) {
      console.log('❌ Файл sessions.json не найден');
      return;
    }

    // Создаем резервную копию
    console.log('📋 Создаем резервную копию...');
    fs.copyFileSync(SESSIONS_FILE, BACKUP_FILE);
    console.log(`✅ Резервная копия создана: ${BACKUP_FILE}`);

    // Читаем существующие сессии
    const sessionsData = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    
    if (!sessionsData.sessions || !Array.isArray(sessionsData.sessions)) {
      console.log('❌ Неверный формат файла сессий');
      return;
    }

    console.log(`📊 Найдено сессий: ${sessionsData.sessions.length}`);

    let migratedCount = 0;
    let errorCount = 0;

    // Мигрируем каждую сессию
    const migratedSessions = sessionsData.sessions.map(session => {
      try {
        const migratedSession = migrateSession(session);
        migratedCount++;
        return migratedSession;
      } catch (error) {
        console.error(`❌ Ошибка миграции сессии ${session.id}:`, error.message);
        errorCount++;
        return session; // Возвращаем оригинальную сессию в случае ошибки
      }
    });

    // Сохраняем мигрированные сессии
    const newSessionsData = {
      sessions: migratedSessions
    };

    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(newSessionsData, null, 2));

    console.log('✅ Миграция завершена!');
    console.log(`📈 Статистика:`);
    console.log(`   - Успешно мигрировано: ${migratedCount}`);
    console.log(`   - Ошибок: ${errorCount}`);
    console.log(`   - Общий размер до: ${fs.statSync(BACKUP_FILE).size} байт`);
    console.log(`   - Общий размер после: ${fs.statSync(SESSIONS_FILE).size} байт`);

  } catch (error) {
    console.error('❌ Критическая ошибка миграции:', error);
    
    // Восстанавливаем из резервной копии
    if (fs.existsSync(BACKUP_FILE)) {
      console.log('🔄 Восстанавливаем из резервной копии...');
      fs.copyFileSync(BACKUP_FILE, SESSIONS_FILE);
      console.log('✅ Резервная копия восстановлена');
    }
  }
}

/**
 * Мигрирует отдельную сессию к новому формату
 */
function migrateSession(session) {
  const data = session.data;
  
  // Валидация и очистка данных
  const migratedData = {
    // Обязательные поля
    language: validateLanguage(data.language),
    registered: Boolean(data.registered),
    phone: data.phone || null,
    currentCity: data.currentCity || null,
    selectedCity: validateSelectedCity(data.selectedCity),
    
    // Опциональные поля
    isAuthenticated: Boolean(data.isAuthenticated),
    otpRetries: Number(data.otpRetries) || 0,
    lastOtpSent: data.lastOtpSent ? Number(data.lastOtpSent) : undefined,
    
    // Корзина
    cart: migrateCart(data.cart),
    
    // Данные заказа
    selectedBranch: validateSelectedBranch(data.selectedBranch),
    deliveryType: validateDeliveryType(data.deliveryType),
    address: data.address || undefined,
    coordinates: migrateCoordinates(data.coordinates),
    
    // Временные данные
    additionalPhone: data.additionalPhone || undefined,
    includeCutlery: data.includeCutlery !== undefined ? Boolean(data.includeCutlery) : undefined,
    lastViewedOrder: data.lastViewedOrder || undefined
  };

  // Удаляем undefined значения
  Object.keys(migratedData).forEach(key => {
    if (migratedData[key] === undefined) {
      delete migratedData[key];
    }
  });

  return {
    id: session.id,
    data: migratedData
  };
}

/**
 * Валидация и нормализация языка
 */
function validateLanguage(language) {
  const validLanguages = ['en', 'ru', 'uz'];
  if (typeof language === 'string' && validLanguages.includes(language)) {
    return language;
  }
  return 'en'; // По умолчанию
}

/**
 * Валидация selectedCity
 */
function validateSelectedCity(selectedCity) {
  if (typeof selectedCity === 'number' && selectedCity > 0) {
    return selectedCity;
  }
  if (typeof selectedCity === 'string' && !isNaN(Number(selectedCity))) {
    const num = Number(selectedCity);
    return num > 0 ? num : null;
  }
  return null;
}

/**
 * Валидация selectedBranch
 */
function validateSelectedBranch(selectedBranch) {
  if (typeof selectedBranch === 'number' && selectedBranch > 0) {
    return selectedBranch;
  }
  if (typeof selectedBranch === 'string' && !isNaN(Number(selectedBranch))) {
    const num = Number(selectedBranch);
    return num > 0 ? num : null;
  }
  return null;
}

/**
 * Валидация deliveryType
 */
function validateDeliveryType(deliveryType) {
  const validTypes = ['pickup', 'delivery'];
  if (typeof deliveryType === 'string' && validTypes.includes(deliveryType)) {
    return deliveryType;
  }
  return undefined;
}

/**
 * Миграция корзины
 */
function migrateCart(cart) {
  if (!cart || typeof cart !== 'object') {
    return undefined;
  }

  const items = Array.isArray(cart.items) ? cart.items.filter(item => {
    return item && 
           typeof item.id === 'number' && 
           typeof item.name === 'string' && 
           typeof item.price === 'number' && 
           typeof item.quantity === 'number' &&
           item.id > 0 && 
           item.price >= 0 && 
           item.quantity > 0;
  }) : [];

  if (items.length === 0) {
    return undefined;
  }

  const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  return {
    items,
    total,
    updatedAt: cart.updatedAt || new Date().toISOString()
  };
}

/**
 * Миграция координат
 */
function migrateCoordinates(coordinates) {
  if (!coordinates || typeof coordinates !== 'object') {
    return undefined;
  }

  const lat = Number(coordinates.latitude);
  const lon = Number(coordinates.longitude);

  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return undefined;
  }

  return {
    latitude: lat,
    longitude: lon
  };
}

// Запускаем миграцию если скрипт вызван напрямую
if (require.main === module) {
  migrateSessions().catch(console.error);
}

module.exports = { migrateSessions }; 