import { session } from 'telegraf';
import fs from 'fs';
import { config } from '../config';

// Ensure session file exists
const ensureSessionFile = () => {
  if (!fs.existsSync(config.sessionPath)) {
    fs.writeFileSync(config.sessionPath, JSON.stringify({}), 'utf8');
  }
};

// Create a JSON file-based session store
const fileStore = {
  async get(key: string) {
    ensureSessionFile();
    const data = JSON.parse(fs.readFileSync(config.sessionPath, 'utf8'));
    return data[key];
  },
  async set(key: string, value: any) {
    ensureSessionFile();
    const data = JSON.parse(fs.readFileSync(config.sessionPath, 'utf8'));
    data[key] = value;
    fs.writeFileSync(config.sessionPath, JSON.stringify(data, null, 2), 'utf8');
  },
  async delete(key: string) {
    ensureSessionFile();
    const data = JSON.parse(fs.readFileSync(config.sessionPath, 'utf8'));
    delete data[key];
    fs.writeFileSync(config.sessionPath, JSON.stringify(data, null, 2), 'utf8');
  }
};

export const sessionMiddleware = session({
  store: fileStore,
  defaultSession: () => ({
    language: 'en',
    step: null,
    data: {},
  })
}); 