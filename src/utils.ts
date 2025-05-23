import fs from 'fs';
import path from 'path';
import { locales } from './locales';

// Create translation function
export function translate(lang: string, key: string, params: Record<string, any> = {}): string {
  const locale = locales[lang as keyof typeof locales] || locales.en;
  let text = locale[key as keyof typeof locale] || key;
  
  // Replace parameters in text
  Object.entries(params).forEach(([param, value]) => {
    text = text.replace(new RegExp(`{${param}}`, 'g'), String(value));
  });
  
  return text;
}

// Session management with JSON file
export const sessionManager = {
  // Path to session file
  sessionPath: process.env.SESSION_PATH || './sessions.json',
  
  // Ensure session file exists
  ensureFile() {
    if (!fs.existsSync(this.sessionPath)) {
      fs.writeFileSync(this.sessionPath, JSON.stringify({}), 'utf8');
    }
  },
  
  // Get session data
  getData() {
    this.ensureFile();
    try {
      return JSON.parse(fs.readFileSync(this.sessionPath, 'utf8'));
    } catch (error) {
      console.error('Error reading session file:', error);
      return {};
    }
  },
  
  // Save session data
  saveData(data: Record<string, any>) {
    this.ensureFile();
    try {
      fs.writeFileSync(this.sessionPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      console.error('Error writing session file:', error);
    }
  },
  
  // Get user session
  getUserSession(userId: number | string) {
    const data = this.getData();
    if (!data[userId]) {
      data[userId] = { language: 'en' };
      this.saveData(data);
    }
    return data[userId];
  },
  
  // Update user session
  updateUserSession(userId: number | string, session: Record<string, any>) {
    const data = this.getData();
    data[userId] = { ...data[userId], ...session };
    this.saveData(data);
    return data[userId];
  }
}; 