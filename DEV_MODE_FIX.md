# Исправление проблемы запуска бота в режиме разработки

## Проблема

Бот не запускался через `bun run dev`, потому что:
1. При запуске бот пытался настроить webhook
2. Если `WEBHOOK_URL` не установлен или содержит неактивный ngrok URL, настройка webhook не удавалась
3. Бот не переключался автоматически на polling режим

## Решение

### 1. Добавлена поддержка polling режима

В файле `index.ts` добавлена логика для автоматического переключения между webhook и polling режимами:

```typescript
// Initialize webhook or polling based on environment
if (process.env.USE_POLLING === 'true' || (process.env.NODE_ENV === 'development' && !config.webhook.url)) {
  // Use polling for local development
  console.log('Starting bot in polling mode...');
  bot.launch({
    webhook: undefined
  }).then(() => {
    console.log('Bot started in polling mode');
  }).catch((error) => {
    console.error('Failed to start bot in polling mode:', error);
    process.exit(1);
  });
} else {
  // Use webhook for production
  setupWebhook();
}
```

### 2. Новые скрипты в package.json

Добавлен новый скрипт для локальной разработки:

```json
{
  "scripts": {
    "dev": "bun --watch index.ts",
    "dev:local": "USE_POLLING=true NODE_ENV=development bun --watch index.ts",
    "start:ngrok": "node scripts/start-with-ngrok.cjs"
  }
}
```

## Использование

### Для локальной разработки (без ngrok)

```bash
bun run dev:local
```

Этот скрипт:
- Устанавливает `USE_POLLING=true` для использования polling вместо webhook
- Устанавливает `NODE_ENV=development` для режима разработки
- Использует `--watch` для автоматической перезагрузки при изменениях

### Для разработки с ngrok

```bash
bun run start:ngrok
```

Этот скрипт:
- Автоматически запускает ngrok
- Обновляет `WEBHOOK_URL` в `.env` файле
- Запускает бота с webhook режимом

### Для production

```bash
bun run start
```

Требует установленный `WEBHOOK_URL` в `.env` файле.

## Переменные окружения

- `USE_POLLING=true` - принудительно использовать polling режим
- `NODE_ENV=development` - режим разработки
- `WEBHOOK_URL` - URL для webhook (если не установлен в development, используется polling)

## Рекомендации

1. Для локальной разработки используйте `bun run dev:local`
2. Для тестирования webhook функциональности используйте `bun run start:ngrok`
3. В production всегда используйте webhook с правильно настроенным `WEBHOOK_URL` 