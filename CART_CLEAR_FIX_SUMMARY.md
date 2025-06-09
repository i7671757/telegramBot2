# Исправление проблемы с очисткой корзины

## Проблема
Кнопка "🗑 Savatni tozalash" не очищала корзину из-за конфликта в порядке обработки кнопок.

## Причина
В сценах `products` и `categories` кнопка корзины обрабатывалась раньше кнопки очистки корзины, и проверка `messageText.includes('Cart')` в обработчике кнопки корзины перехватывала сообщения с текстом "Clear Cart".

## Исправления

### 1. Изменен порядок обработки кнопок
- **До**: Сначала кнопка корзины, потом очистка корзины
- **После**: Сначала очистка корзины, потом кнопка корзины

### 2. Улучшена логика определения кнопки очистки
- Добавлена проверка на эмодзи `🗑` для более точного определения
- Убрана общая проверка на "Clear" чтобы избежать конфликтов

### 3. Файлы, которые были изменены:
- `src/scenes/products.scene.ts`
- `src/scenes/categories.scene.ts` 
- `src/scenes/newOrder.scene.ts`

### 4. Конкретные изменения:

#### В products.scene.ts и categories.scene.ts:
```typescript
// БЫЛО:
// Handle cart button
if (messageText.includes('Cart')) { ... }

// Handle clear cart  
if (messageText.includes('Clear')) { ... }

// СТАЛО:
// Handle clear cart FIRST (before cart button to avoid conflicts)
if (messageText === ctx.i18n.t('cart.clear') || 
    messageText.includes('🗑') ||
    messageText.includes('Очистить') ||
    messageText.includes('Tozalash')) { ... }

// Handle cart button (after clear cart to avoid conflicts)
if (messageText.includes('Cart')) { ... }
```

#### В newOrder.scene.ts:
```typescript
// Убрана проверка на 'Clear' чтобы избежать конфликтов
if (messageText === ctx.i18n.t('cart.clear') || 
    messageText.includes('🗑') || 
    messageText.includes('Очистить корзину') ||
    messageText.includes('Tozalash')) { ... }
```

## Результат
Теперь кнопка "🗑 Savatni tozalash" правильно очищает корзину во всех сценах:
- ✅ products.scene.ts
- ✅ categories.scene.ts  
- ✅ newOrder.scene.ts

## Тестирование
Создан и выполнен тест `test_cart_clear_fix.cjs`, который подтвердил:
- ✅ Правильный порядок обработки кнопок
- ✅ Корректное определение кнопки очистки корзины
- ✅ Отсутствие конфликтов между кнопками 