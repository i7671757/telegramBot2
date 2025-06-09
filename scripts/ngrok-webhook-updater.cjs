const ngrok = require('@ngrok/ngrok');
const fs = require('fs');
const path = require('path');

// Загружаем переменные окружения из .env файла
function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env');
  
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    
    envContent.split('\n').forEach(line => {
      if (line.startsWith('#') || !line.trim()) return;
      
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim().replace(/^["'](.*)["']$/, '$1');
        process.env[key.trim()] = value;
      }
    });
    
    console.log('🔧 Переменные окружения загружены из .env файла');
  }
}

// Загружаем переменные окружения при импорте модуля
loadEnvFile();

/**
 * Автоматически обновляет WEBHOOK_URL в файле .env при запуске ngrok
 */
class NgrokWebhookUpdater {
  constructor(options = {}) {
    this.port = options.port || 3000;
    this.envPath = options.envPath || path.resolve(process.cwd(), '.env');
    this.authtoken = options.authtoken || process.env.NGROK_AUTHTOKEN;
    this.listener = null;
  }

  /**
   * Читает файл .env и парсит его в объект
   */
  readEnvFile() {
    try {
      if (!fs.existsSync(this.envPath)) {
        console.log('Файл .env не найден, создаю новый...');
        return {};
      }

      const envContent = fs.readFileSync(this.envPath, 'utf-8');
      const envVars = {};

      envContent.split('\n').forEach(line => {
        // Пропускаем комментарии и пустые строки
        if (line.startsWith('#') || !line.trim()) return;

        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim().replace(/^["'](.*)["']$/, '$1');
          envVars[key.trim()] = value;
        }
      });

      return envVars;
    } catch (error) {
      console.error('Ошибка при чтении .env файла:', error);
      return {};
    }
  }

  /**
   * Записывает объект переменных окружения в файл .env
   */
  writeEnvFile(envVars) {
    try {
      const envContent = Object.entries(envVars)
        .map(([key, value]) => {
          // Экранируем значения, содержащие пробелы или специальные символы
          const needsQuotes = /[\s#=]/.test(value);
          return `${key}=${needsQuotes ? `"${value}"` : value}`;
        })
        .join('\n');

      fs.writeFileSync(this.envPath, envContent + '\n', 'utf-8');
      console.log(`✅ Файл .env обновлен: ${this.envPath}`);
    } catch (error) {
      console.error('❌ Ошибка при записи .env файла:', error);
      throw error;
    }
  }

  /**
   * Обновляет WEBHOOK_URL в файле .env
   */
  updateWebhookUrl(newUrl) {
    const envVars = this.readEnvFile();
    const oldUrl = envVars.WEBHOOK_URL;

    envVars.WEBHOOK_URL = newUrl;
    this.writeEnvFile(envVars);

    console.log(`🔄 WEBHOOK_URL обновлен:`);
    console.log(`   Старый: ${oldUrl || 'не установлен'}`);
    console.log(`   Новый:  ${newUrl}`);

    return { oldUrl, newUrl };
  }

  /**
   * Запускает ngrok и автоматически обновляет .env файл
   */
  async start() {
    try {
      console.log(`🚀 Запуск ngrok для порта ${this.port}...`);

      // Настройки для ngrok
      const ngrokConfig = {
        addr: this.port,
        authtoken_from_env: true
      };

      // Если authtoken передан напрямую, используем его
      if (this.authtoken && !process.env.NGROK_AUTHTOKEN) {
        ngrokConfig.authtoken = this.authtoken;
        delete ngrokConfig.authtoken_from_env;
      }

      // Запускаем ngrok
      this.listener = await ngrok.forward(ngrokConfig);
      const ngrokUrl = this.listener.url();

      console.log(`✅ Ngrok туннель установлен: ${ngrokUrl}`);

      // Обновляем .env файл
      this.updateWebhookUrl(ngrokUrl);

      // Возвращаем URL для использования в приложении
      return ngrokUrl;

    } catch (error) {
      console.error('❌ Ошибка при запуске ngrok:', error);
      
      if (error.message.includes('authtoken')) {
        console.error('💡 Убедитесь, что NGROK_AUTHTOKEN установлен в переменных окружения');
        console.error('   Получить токен можно на: https://dashboard.ngrok.com/get-started/your-authtoken');
      }
      
      throw error;
    }
  }

  /**
   * Останавливает ngrok туннель
   */
  async stop() {
    if (this.listener) {
      try {
        await this.listener.close();
        console.log('🛑 Ngrok туннель закрыт');
      } catch (error) {
        console.error('❌ Ошибка при закрытии ngrok туннеля:', error);
      }
    }
  }

  /**
   * Получает текущий URL туннеля
   */
  getUrl() {
    return this.listener ? this.listener.url() : null;
  }
}

module.exports = NgrokWebhookUpdater;

// Если скрипт запущен напрямую
if (require.main === module) {
  const updater = new NgrokWebhookUpdater({
    port: process.env.PORT || 3000
  });

  // Запускаем ngrok
  updater.start()
    .then(url => {
      console.log(`🎉 Готово! Ваш webhook URL: ${url}`);
      console.log('📝 Файл .env автоматически обновлен');
      console.log('🔄 Перезапустите ваш бот для применения изменений');
    })
    .catch(error => {
      console.error('💥 Не удалось запустить ngrok:', error);
      process.exit(1);
    });

  // Обработка сигналов завершения
  process.on('SIGINT', async () => {
    console.log('\n🛑 Получен сигнал завершения...');
    await updater.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Получен сигнал завершения...');
    await updater.stop();
    process.exit(0);
  });
} 