import TelegrafI18n from 'telegraf-i18n';
import path from 'path';

// Initialize i18n
export const i18n = new TelegrafI18n({
  defaultLanguage: 'en',
  allowMissing: true,
  directory: path.resolve(__dirname, '../locales'),
  useSession: true,
  sessionName: 'session'
}); 