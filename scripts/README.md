# Скрипты для автоматического обновления Webhook

## 🚀 Быстрый запуск

1. **Добавьте ngrok токен в .env:**
   ```bash
   NGROK_AUTHTOKEN=your_ngrok_authtoken_here
   ```

2. **Запустите бот с автоматическим webhook:**
   ```bash
   npm run start:ngrok
   # или
   bun run start:ngrok
   ```

## 📁 Файлы

- `ngrok-webhook-updater.js` - Управление ngrok и обновление .env
- `start-with-ngrok.js` - Запуск бота с ngrok
- `README.md` - Эта инструкция

## 🔧 Команды

```bash
# Запуск бота с ngrok
npm run start:ngrok

# Только обновление webhook URL
npm run ngrok:update

# Обычный запуск
npm run start
```

## ❓ Проблемы?

Смотрите подробную документацию в `NGROK_SETUP.md` в корне проекта. 