import { resolve } from 'path';
import * as fs from 'fs';

const dotenvPath = resolve(process.cwd(), '.env');

// Simple function to parse .env file
function loadEnv(path: string) {
  try {
    if (fs.existsSync(path)) {
      const envFile = fs.readFileSync(path, 'utf-8');
      const envVars = envFile.split('\n');
      
      envVars.forEach(line => {
        // Skip comments and empty lines
        if (line.startsWith('#') || !line.trim()) return;
        
        const [key, value] = line.split('=');
        if (key && value) {
          process.env[key.trim()] = value.trim().replace(/^["'](.*)["']$/, '$1');
        }
      });
      
      console.log('Environment variables loaded from .env file');
    } else {
      console.warn('.env file not found, using process.env');
    }
  } catch (error) {
    console.warn('Failed to load .env file, using process.env:', error);
  }
}

// Load env variables
loadEnv(dotenvPath);

export const config = {
  botToken: process.env.BOT_TOKEN || '',
  sessionPath: process.env.SESSION_PATH || './sessions.json',
  isDev: process.env.NODE_ENV !== 'production',
}; 