const NgrokWebhookUpdater = require('./ngrok-webhook-updater.cjs');
const { spawn } = require('child_process');
const path = require('path');

/**
 * Запускает бот с автоматическим обновлением ngrok webhook
 */
class BotWithNgrok {
  constructor(options = {}) {
    this.port = options.port || 3000;
    this.botScript = options.botScript || 'index.ts';
    this.ngrokUpdater = new NgrokWebhookUpdater({ port: this.port });
    this.botProcess = null;
  }

  /**
   * Запускает ngrok и затем бот
   */
  async start() {
    try {
      console.log('🚀 Запуск системы с автоматическим обновлением webhook...\n');

      // 1. Запускаем ngrok и обновляем .env
      console.log('📡 Шаг 1: Настройка ngrok туннеля...');
      const webhookUrl = await this.ngrokUpdater.start();
      
      console.log('\n✅ Ngrok настроен успешно!');
      console.log(`🌐 Публичный URL: ${webhookUrl}`);
      console.log('📝 Файл .env обновлен с новым WEBHOOK_URL\n');

      // 2. Запускаем бот
      console.log('🤖 Шаг 2: Запуск Telegram бота...');
      await this.startBot();

      console.log('\n🎉 Система запущена успешно!');
      console.log('📱 Ваш Telegram бот теперь доступен через webhook');
      console.log('🔄 Webhook автоматически обновится при следующем запуске\n');

    } catch (error) {
      console.error('❌ Ошибка при запуске системы:', error);
      await this.cleanup();
      process.exit(1);
    }
  }

  /**
   * Запускает бот процесс
   */
  async startBot() {
    return new Promise((resolve, reject) => {
      // Определяем команду для запуска бота
      const isTypeScript = this.botScript.endsWith('.ts');
      const command = isTypeScript ? 'bun' : 'node';
      const args = isTypeScript ? ['run', this.botScript] : [this.botScript];

      console.log(`   Команда: ${command} ${args.join(' ')}`);

      // Запускаем бот процесс
      this.botProcess = spawn(command, args, {
        stdio: 'inherit',
        cwd: process.cwd()
      });

      // Обработка событий процесса
      this.botProcess.on('spawn', () => {
        console.log('   ✅ Бот процесс запущен');
        resolve();
      });

      this.botProcess.on('error', (error) => {
        console.error('   ❌ Ошибка запуска бота:', error);
        reject(error);
      });

      this.botProcess.on('exit', (code, signal) => {
        if (code !== 0) {
          console.log(`   ⚠️  Бот завершился с кодом: ${code}, сигнал: ${signal}`);
        } else {
          console.log('   ✅ Бот завершился нормально');
        }
      });
    });
  }

  /**
   * Очистка ресурсов
   */
  async cleanup() {
    console.log('\n🧹 Очистка ресурсов...');

    // Останавливаем бот процесс
    if (this.botProcess && !this.botProcess.killed) {
      console.log('   🛑 Остановка бота...');
      this.botProcess.kill('SIGTERM');
      
      // Ждем завершения процесса
      await new Promise((resolve) => {
        this.botProcess.on('exit', resolve);
        setTimeout(() => {
          if (!this.botProcess.killed) {
            this.botProcess.kill('SIGKILL');
          }
          resolve();
        }, 5000);
      });
    }

    // Останавливаем ngrok
    await this.ngrokUpdater.stop();
    console.log('✅ Очистка завершена');
  }

  /**
   * Получает текущий webhook URL
   */
  getWebhookUrl() {
    return this.ngrokUpdater.getUrl();
  }
}

// Если скрипт запущен напрямую
if (require.main === module) {
  const botWithNgrok = new BotWithNgrok({
    port: process.env.PORT || 3000,
    botScript: process.argv[2] || 'index.ts'
  });

  // Запускаем систему
  botWithNgrok.start().catch(error => {
    console.error('💥 Критическая ошибка:', error);
    process.exit(1);
  });

  // Обработка сигналов завершения
  const handleShutdown = async (signal) => {
    console.log(`\n🛑 Получен сигнал ${signal}, завершение работы...`);
    await botWithNgrok.cleanup();
    process.exit(0);
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  // Обработка необработанных ошибок
  process.on('unhandledRejection', async (reason, promise) => {
    console.error('❌ Необработанное отклонение Promise:', reason);
    await botWithNgrok.cleanup();
    process.exit(1);
  });

  process.on('uncaughtException', async (error) => {
    console.error('❌ Необработанное исключение:', error);
    await botWithNgrok.cleanup();
    process.exit(1);
  });
}

module.exports = BotWithNgrok; 