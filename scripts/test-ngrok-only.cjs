const NgrokWebhookUpdater = require('./ngrok-webhook-updater.cjs');

async function testNgrok() {
  const updater = new NgrokWebhookUpdater({
    port: process.env.PORT || 3000
  });

  try {
    console.log('🚀 Тестирование ngrok...');
    const url = await updater.start();
    console.log(`✅ Ngrok URL: ${url}`);
    
    // Ждем 5 секунд
    console.log('⏳ Ожидание 5 секунд...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('🛑 Остановка ngrok...');
    await updater.stop();
    console.log('✅ Тест завершен');
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  }
}

testNgrok(); 