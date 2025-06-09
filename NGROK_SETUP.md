# Автоматическое обновление Webhook с Ngrok

Эта система автоматически обновляет `WEBHOOK_URL` в файле `.env` при каждом запуске ngrok, решая проблему изменения URL при перезапуске.

## 🚀 Быстрый старт

### 1. Установка зависимостей

Убедитесь, что у вас установлена зависимость ngrok:

```bash
npm install @ngrok/ngrok
# или
bun add @ngrok/ngrok
```

### 2. Настройка ngrok токена

Получите ваш authtoken на [ngrok dashboard](https://dashboard.ngrok.com/get-started/your-authtoken) и добавьте его в `.env`:

```bash
# В файле .env
NGROK_AUTHTOKEN=your_ngrok_authtoken
```

### 3. Запуск с автоматическим обновлением webhook

```bash
# Запуск с автоматическим обновлением .env
npm run start:ngrok

# Или только обновление webhook URL без запуска бота
npm run ngrok:update
```

## 📁 Структура файлов

```
scripts/
├── ngrok-webhook-updater.js    # Класс для управления ngrok и обновления .env
└── start-with-ngrok.js         # Скрипт для запуска бота с ngrok
```

## 🔧 Как это работает

### 1. NgrokWebhookUpdater

Класс `NgrokWebhookUpdater` выполняет следующие функции:

- **Запуск ngrok**: Создает туннель на указанный порт
- **Получение URL**: Извлекает публичный URL туннеля
- **Обновление .env**: Автоматически обновляет `WEBHOOK_URL` в файле `.env`
- **Управление жизненным циклом**: Корректно закрывает туннель при завершении

### 2. BotWithNgrok

Класс `BotWithNgrok` координирует работу:

1. Запускает ngrok и обновляет `.env`
2. Запускает бот процесс
3. Обрабатывает сигналы завершения
4. Корректно очищает ресурсы

## 📝 Примеры использования

### Базовое использование

```javascript
const NgrokWebhookUpdater = require('./scripts/ngrok-webhook-updater');

const updater = new NgrokWebhookUpdater({
  port: 3000
});

// Запуск ngrok и обновление .env
const webhookUrl = await updater.start();
console.log('Webhook URL:', webhookUrl);

// Остановка
await updater.stop();
```

### Интеграция с ботом

```javascript
const BotWithNgrok = require('./scripts/start-with-ngrok');

const botWithNgrok = new BotWithNgrok({
  port: 3000,
  botScript: 'index.ts'
});

await botWithNgrok.start();
```

## ⚙️ Конфигурация

### Переменные окружения

```bash
# Обязательные
BOT_TOKEN=your_telegram_bot_token
NGROK_AUTHTOKEN=your_ngrok_authtoken

# Опциональные
PORT=3000                    # Порт для сервера
HOST=0.0.0.0                # Хост для сервера
WEBHOOK_PATH=/webhook        # Путь для webhook
WEBHOOK_URL=                 # Автоматически обновляется
```

### Параметры NgrokWebhookUpdater

```javascript
const updater = new NgrokWebhookUpdater({
  port: 3000,                           // Порт для туннеля
  envPath: '/path/to/.env',            // Путь к .env файлу
  authtoken: 'your_token'              // Токен (если не в переменных окружения)
});
```

## 🛠️ Команды npm/bun

```bash
# Запуск бота с автоматическим ngrok
npm run start:ngrok
bun run start:ngrok

# Только обновление webhook URL
npm run ngrok:update
bun run ngrok:update

# Обычный запуск без ngrok
npm run start
bun run start
```

## 🔍 Отладка

### Проверка статуса webhook

```bash
# Информация о текущем webhook
npm run webhook:info

# Установка webhook вручную
npm run webhook:set

# Удаление webhook
npm run webhook:delete
```

### Логи

Система выводит подробные логи:

```
🚀 Запуск ngrok для порта 3000...
✅ Ngrok туннель установлен: https://abc123.ngrok.app
🔄 WEBHOOK_URL обновлен:
   Старый: https://old-url.ngrok.app
   Новый:  https://abc123.ngrok.app
✅ Файл .env обновлен: /path/to/.env
🤖 Шаг 2: Запуск Telegram бота...
   Команда: bun run index.ts
   ✅ Бот процесс запущен
🎉 Система запущена успешно!
```

## ❗ Решение проблем

### Ошибка авторизации ngrok

```
❌ Ошибка при запуске ngrok: authtoken required
💡 Убедитесь, что NGROK_AUTHTOKEN установлен в переменных окружения
   Получить токен можно на: https://dashboard.ngrok.com/get-started/your-authtoken
```

**Решение**: Добавьте `NGROK_AUTHTOKEN` в файл `.env`

### Файл .env не найден

```
Файл .env не найден, создаю новый...
✅ Файл .env обновлен: /path/to/.env
```

**Решение**: Система автоматически создаст файл `.env` с `WEBHOOK_URL`

### Порт уже занят

```
❌ Ошибка при запуске ngrok: port 3000 already in use
```

**Решение**: Измените порт в переменной `PORT` или остановите процесс на порту 3000

## 🔄 Автоматизация

### Добавление в package.json

```json
{
  "scripts": {
    "dev:ngrok": "node scripts/start-with-ngrok.js",
    "webhook:update": "node scripts/ngrok-webhook-updater.js"
  }
}
```

### Использование в CI/CD

```yaml
# GitHub Actions example
- name: Start bot with ngrok
  run: |
    echo "NGROK_AUTHTOKEN=${{ secrets.NGROK_AUTHTOKEN }}" >> .env
    echo "BOT_TOKEN=${{ secrets.BOT_TOKEN }}" >> .env
    npm run start:ngrok
```

## 📚 API Reference

### NgrokWebhookUpdater

#### Методы

- `start()` - Запускает ngrok и обновляет .env
- `stop()` - Останавливает ngrok туннель
- `getUrl()` - Возвращает текущий URL туннеля
- `updateWebhookUrl(url)` - Обновляет WEBHOOK_URL в .env

#### События

- Автоматическое обновление .env при запуске
- Логирование всех операций
- Корректная очистка ресурсов при завершении

### BotWithNgrok

#### Методы

- `start()` - Запускает ngrok и бот
- `cleanup()` - Очищает все ресурсы
- `getWebhookUrl()` - Возвращает webhook URL

## 🎯 Преимущества

1. **Автоматизация**: Никаких ручных действий при перезапуске
2. **Надежность**: Корректная обработка ошибок и очистка ресурсов
3. **Простота**: Один скрипт для всего процесса
4. **Гибкость**: Настраиваемые параметры и пути
5. **Отладка**: Подробные логи для диагностики

## 🔗 Полезные ссылки

- [Ngrok Dashboard](https://dashboard.ngrok.com/)
- [Ngrok JavaScript SDK](https://github.com/ngrok/ngrok-javascript)
- [Telegram Bot API - Webhooks](https://core.telegram.org/bots/api#setwebhook) 