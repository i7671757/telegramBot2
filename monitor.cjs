#!/usr/bin/env node

const https = require('https');

const BOT_TOKEN = '8141347686:AAHQ0_UOGFkUHUnMFk23WGDrONaBO8fsuZc';
const WEBHOOK_URL = 'https://10dc-146-120-16-63.ngrok-free.app';

async function checkBotStatus() {
  console.log('🤖 Checking bot status...');
  
  try {
    // Check bot info
    const botInfo = await makeRequest(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
    console.log(`✅ Bot is active: @${botInfo.result.username} (${botInfo.result.first_name})`);
    
    // Check webhook info
    const webhookInfo = await makeRequest(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
    console.log(`🔗 Webhook URL: ${webhookInfo.result.url}`);
    console.log(`📊 Pending updates: ${webhookInfo.result.pending_update_count}`);
    
    if (webhookInfo.result.last_error_date) {
      console.log(`❌ Last error: ${webhookInfo.result.last_error_message}`);
    } else {
      console.log('✅ No webhook errors');
    }
    
    // Check server health
    const healthCheck = await makeRequest(`${WEBHOOK_URL}/health`);
    console.log(`🏥 Server health: ${healthCheck.status}`);
    
    // Test webhook endpoint
    const webhookTest = await makeRequest(`${WEBHOOK_URL}/webhook`, 'POST', {
      update_id: Date.now(),
      message: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 123, type: 'private' },
        from: { id: 123, is_bot: false, first_name: 'Test' },
        text: 'test'
      }
    });
    console.log(`🧪 Webhook test: ${webhookTest.ok ? 'OK' : 'FAILED'}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

function makeRequest(url, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    const req = https.request(url, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve({ status: 'ok', raw: body });
        }
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Run check
checkBotStatus(); 