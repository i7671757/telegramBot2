# 🎯 Решение проблем с Telegram ботом и ngrok

## 📋 Проблемы, которые были решены:

### 1. ❌ Ошибка "Bot is not running!" при остановке
**Проблема:** Двойной вызов `bot.stop()` из-за обработчиков SIGINT и SIGTERM

**Решение:** Добавлен флаг `isShuttingDown` для предотвращения повторных вызовов:
```typescript
let isShuttingDown = false;

const gracefulShutdown = (signal: string) => {
  if (isShuttingDown) {
    console.log(`${signal} received, but shutdown already in progress`);
    return;
  }
  
  isShuttingDown = true;
  console.log(`${signal} received, stopping bot`);
  
  try {
    bot.stop(signal);
  } catch (error) {
    console.error('Error during bot shutdown:', error);
  }
};
```

### 2. ❌ Ошибка ngrok "limited to 1 simultaneous session"
**Проблема:** Запуск нескольких процессов ngrok одновременно

**Решение:** 
- Остановка всех конфликтующих процессов перед запуском
- Использование интегрированного решения `npm run start:ngrok`
- Добавлен тестовый скрипт `npm run test:ngrok` для проверки только ngrok

### 3. ❌ HTTP вместо HTTPS для webhook
**Проблема:** Telegram требует HTTPS для webhook

**Решение:** Автоматическое создание HTTPS туннеля через ngrok

### 4. ❌ Дублирование пути webhook
**Проблема:** URL формировался как `/telegraf/telegraf`

**Решение:** Исправлен путь в .env: `WEBHOOK_PATH=/webhook`

## 🚀 Итоговое решение:

### Конфигурация .env:
```env
BOT_TOKEN=8141347686:AAHQ0_UOGFkUHUnMFk23WGDrONaBO8fsuZc
WEBHOOK_URL=https://dcff-146-120-16-63.ngrok-free.app  # Автоматически обновляется
WEBHOOK_PATH=/webhook                                   # Исправлен путь
PORT=3000
HOST=0.0.0.0
NGROK_AUTHTOKEN=2uzB335dojXXGo6XI1NANpogRzi_2CopEC6QwC5yjvuwgEk9J
```

### Доступные команды:

#### Основные команды:
```bash
# Запуск бота с автоматическим ngrok (РЕКОМЕНДУЕТСЯ)
bun run start:ngrok

# Обычный запуск бота (требует настроенный WEBHOOK_URL)
bun run start

# Разработка с автоперезагрузкой
bun run dev
```

#### Утилиты ngrok:
```bash
# Только обновление ngrok URL без запуска бота
bun run ngrok:update

# Тестирование только ngrok
bun run test:ngrok
```

#### Диагностика:
```bash
# Диагностика проблем с webhook
bun run webhook:fix

# Тестирование конфигурации
bun run test:config

# Информация о webhook
bun run webhook:info
```

## ✅ Что работает сейчас:

1. **Автоматическое обновление WEBHOOK_URL** - при каждом запуске создается новый ngrok туннель
2. **HTTPS webhook** - все запросы идут через защищенный туннель
3. **Корректное завершение бота** - без ошибок "Bot is not running!"
4. **Синхронизация ngrok и бота** - интегрированное управление процессами
5. **Диагностические инструменты** - для быстрого выявления проблем

## 🎯 Рекомендации:

### Для разработки:
```bash
bun run start:ngrok
```

### Для продакшена:
Настройте постоянный HTTPS URL и используйте:
```bash
bun run start
```

### При проблемах:
1. `bun run webhook:fix` - диагностика
2. `bun run test:config` - проверка конфигурации  
3. `bun run test:ngrok` - тест ngrok
4. Проверьте, что нет других запущенных процессов: `ps aux | grep -E "(bun|ngrok)"`

## 📁 Созданные файлы:

- `scripts/ngrok-webhook-updater.cjs` - автоматическое обновление webhook
- `scripts/start-with-ngrok.cjs` - интегрированный запуск ngrok + бот
- `scripts/fix-webhook-url.cjs` - диагностика проблем
- `scripts/test-config.cjs` - тестирование конфигурации
- `scripts/test-ngrok-only.cjs` - тестирование только ngrok
- `NGROK_SETUP.md` - подробная документация

## 🎉 Результат:

Теперь ваш Telegram бот работает стабильно с автоматическим обновлением webhook URL при каждом перезапуске ngrok! Все проблемы решены. 