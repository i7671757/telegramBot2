const fs = require('fs');
const path = require('path');

/**
 * Исправляет проблему с HTTP/HTTPS в WEBHOOK_URL
 */
class WebhookUrlFixer {
  constructor() {
    this.envPath = path.resolve(process.cwd(), '.env');
  }

  /**
   * Читает и анализирует .env файл
   */
  analyzeEnvFile() {
    try {
      if (!fs.existsSync(this.envPath)) {
        console.log('❌ Файл .env не найден');
        console.log('📝 Создайте файл .env со следующим содержимым:');
        this.showEnvTemplate();
        return null;
      }

      const envContent = fs.readFileSync(this.envPath, 'utf-8');
      const envVars = {};

      envContent.split('\n').forEach(line => {
        if (line.startsWith('#') || !line.trim()) return;
        
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length >= 0) {
          const value = valueParts.join('=').trim().replace(/^["'](.*)["']$/, '$1');
          envVars[key.trim()] = value;
        }
      });

      return envVars;
    } catch (error) {
      console.error('❌ Ошибка при чтении .env файла:', error);
      return null;
    }
  }

  /**
   * Показывает шаблон .env файла
   */
  showEnvTemplate() {
    console.log(`
# Telegram Bot Configuration
BOT_TOKEN=your_telegram_bot_token_here

# Ngrok Configuration  
NGROK_AUTHTOKEN=your_ngrok_authtoken_here
WEBHOOK_URL=

# Server Configuration
PORT=3000
HOST=0.0.0.0
WEBHOOK_PATH=/webhook

# Session Configuration
SESSION_PATH=./sessions.json

# API Configuration
API_URL=https://api.lesailes.uz/

# Environment
NODE_ENV=development
`);
  }

  /**
   * Анализирует проблемы с webhook URL
   */
  diagnoseWebhookIssues(envVars) {
    const issues = [];
    
    if (!envVars.BOT_TOKEN || envVars.BOT_TOKEN === 'your_telegram_bot_token_here') {
      issues.push({
        type: 'missing_bot_token',
        message: 'BOT_TOKEN не установлен или содержит значение по умолчанию'
      });
    }

    if (!envVars.NGROK_AUTHTOKEN || envVars.NGROK_AUTHTOKEN === 'your_ngrok_authtoken_here') {
      issues.push({
        type: 'missing_ngrok_token',
        message: 'NGROK_AUTHTOKEN не установлен или содержит значение по умолчанию'
      });
    }

    if (envVars.WEBHOOK_URL) {
      if (envVars.WEBHOOK_URL.startsWith('http://')) {
        issues.push({
          type: 'http_webhook',
          message: 'WEBHOOK_URL использует HTTP вместо HTTPS',
          current: envVars.WEBHOOK_URL,
          fix: 'Удалите WEBHOOK_URL из .env - он будет автоматически установлен ngrok'
        });
      } else if (!envVars.WEBHOOK_URL.startsWith('https://')) {
        issues.push({
          type: 'invalid_webhook',
          message: 'WEBHOOK_URL имеет неверный формат',
          current: envVars.WEBHOOK_URL,
          fix: 'Удалите WEBHOOK_URL из .env - он будет автоматически установлен ngrok'
        });
      }
    }

    return issues;
  }

  /**
   * Предлагает решения для найденных проблем
   */
  suggestFixes(issues) {
    console.log('\n🔍 Анализ проблем с webhook:\n');

    if (issues.length === 0) {
      console.log('✅ Проблем не найдено! Конфигурация выглядит корректно.');
      return;
    }

    issues.forEach((issue, index) => {
      console.log(`${index + 1}. ❌ ${issue.message}`);
      
      if (issue.current) {
        console.log(`   Текущее значение: ${issue.current}`);
      }
      
      if (issue.fix) {
        console.log(`   💡 Решение: ${issue.fix}`);
      }
      
      console.log('');
    });

    this.showFixInstructions(issues);
  }

  /**
   * Показывает инструкции по исправлению
   */
  showFixInstructions(issues) {
    console.log('🛠️  Инструкции по исправлению:\n');

    const hasTokenIssues = issues.some(i => i.type.includes('token'));
    const hasWebhookIssues = issues.some(i => i.type.includes('webhook'));

    if (hasTokenIssues) {
      console.log('1. 🔑 Настройте токены:');
      console.log('   - Получите BOT_TOKEN от @BotFather в Telegram');
      console.log('   - Получите NGROK_AUTHTOKEN на https://dashboard.ngrok.com/get-started/your-authtoken');
      console.log('   - Обновите соответствующие значения в файле .env\n');
    }

    if (hasWebhookIssues) {
      console.log('2. 🌐 Исправьте WEBHOOK_URL:');
      console.log('   - Удалите или очистите строку WEBHOOK_URL= в .env файле');
      console.log('   - Ngrok автоматически установит правильный HTTPS URL\n');
    }

    console.log('3. 🚀 Запустите с автоматическим ngrok:');
    console.log('   npm run start:ngrok');
    console.log('   # или');
    console.log('   bun run start:ngrok\n');

    console.log('4. 🔄 Альтернативно, только обновите webhook:');
    console.log('   npm run ngrok:update\n');
  }

  /**
   * Запускает полную диагностику
   */
  run() {
    console.log('🔍 Диагностика проблем с webhook...\n');

    const envVars = this.analyzeEnvFile();
    
    if (!envVars) {
      return;
    }

    console.log('📋 Текущая конфигурация:');
    console.log(`   BOT_TOKEN: ${envVars.BOT_TOKEN ? '✅ установлен' : '❌ не установлен'}`);
    console.log(`   NGROK_AUTHTOKEN: ${envVars.NGROK_AUTHTOKEN ? '✅ установлен' : '❌ не установлен'}`);
    console.log(`   WEBHOOK_URL: ${envVars.WEBHOOK_URL || '(пусто)'}`);
    console.log(`   PORT: ${envVars.PORT || '3000'}`);

    const issues = this.diagnoseWebhookIssues(envVars);
    this.suggestFixes(issues);

    if (issues.length === 0) {
      console.log('\n🎉 Все готово! Можете запускать:');
      console.log('   npm run start:ngrok');
    }
  }
}

// Если скрипт запущен напрямую
if (require.main === module) {
  const fixer = new WebhookUrlFixer();
  fixer.run();
}

module.exports = WebhookUrlFixer; 