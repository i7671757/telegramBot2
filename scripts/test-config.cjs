const fs = require('fs');
const path = require('path');

// Загружаем переменные окружения
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  
  if (!fs.existsSync(envPath)) {
    console.log('❌ Файл .env не найден');
    return {};
  }

  const envContent = fs.readFileSync(envPath, 'utf-8');
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
}

// Тестируем конфигурацию
function testConfig() {
  console.log('🔍 Тестирование конфигурации бота...\n');
  
  const envVars = loadEnv();
  
  // Проверяем основные переменные
  const config = {
    botToken: envVars.BOT_TOKEN || '',
    webhookUrl: envVars.WEBHOOK_URL || '',
    webhookPath: envVars.WEBHOOK_PATH || '/webhook',
    port: parseInt(envVars.PORT || '3000'),
    host: envVars.HOST || '0.0.0.0',
    ngrokToken: envVars.NGROK_AUTHTOKEN || ''
  };

  console.log('📋 Текущая конфигурация:');
  console.log(`   BOT_TOKEN: ${config.botToken ? '✅ установлен' : '❌ не установлен'}`);
  console.log(`   WEBHOOK_URL: ${config.webhookUrl || '(пусто - будет установлен ngrok)'}`);
  console.log(`   WEBHOOK_PATH: ${config.webhookPath}`);
  console.log(`   PORT: ${config.port}`);
  console.log(`   HOST: ${config.host}`);
  console.log(`   NGROK_AUTHTOKEN: ${config.ngrokToken ? '✅ установлен' : '❌ не установлен'}\n`);

  // Формируем итоговый webhook URL
  if (config.webhookUrl) {
    const finalWebhookUrl = `${config.webhookUrl}${config.webhookPath}`;
    console.log(`🌐 Итоговый webhook URL: ${finalWebhookUrl}`);
    
    // Проверяем протокол
    if (finalWebhookUrl.startsWith('http://')) {
      console.log('⚠️  ВНИМАНИЕ: Webhook использует HTTP вместо HTTPS!');
      console.log('   Telegram требует HTTPS для webhook.');
    } else if (finalWebhookUrl.startsWith('https://')) {
      console.log('✅ Webhook использует HTTPS - корректно!');
    }
  } else {
    console.log('🌐 Webhook URL не установлен - будет использован ngrok');
  }

  // Проверяем готовность к запуску
  console.log('\n🚀 Готовность к запуску:');
  
  const issues = [];
  
  if (!config.botToken) {
    issues.push('BOT_TOKEN не установлен');
  }
  
  if (!config.ngrokToken && !config.webhookUrl) {
    issues.push('Ни NGROK_AUTHTOKEN, ни WEBHOOK_URL не установлены');
  }
  
  if (config.webhookUrl && config.webhookUrl.startsWith('http://')) {
    issues.push('WEBHOOK_URL использует HTTP вместо HTTPS');
  }

  if (issues.length === 0) {
    console.log('✅ Конфигурация готова к запуску!');
    
    if (config.ngrokToken) {
      console.log('\n💡 Рекомендуемый способ запуска:');
      console.log('   npm run start:ngrok');
      console.log('   # или');
      console.log('   bun run start:ngrok');
    } else {
      console.log('\n💡 Можно запускать обычным способом:');
      console.log('   npm run start');
      console.log('   # или');
      console.log('   bun run start');
    }
  } else {
    console.log('❌ Найдены проблемы:');
    issues.forEach((issue, index) => {
      console.log(`   ${index + 1}. ${issue}`);
    });
    
    console.log('\n💡 Для исправления запустите:');
    console.log('   npm run webhook:fix');
  }
}

// Запускаем тест
if (require.main === module) {
  testConfig();
}

module.exports = { testConfig, loadEnv }; 