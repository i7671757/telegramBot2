import { Context, Scenes } from 'telegraf';
import TelegrafI18n from 'telegraf-i18n';

interface MySceneSession extends Scenes.SceneSessionData {
  // Add any custom scene session properties here
}

interface MySession extends Scenes.SceneSession<MySceneSession> {
  language?: string;
  registered?: boolean;
  phone?: string | null;
  currentCity?: string | null;
  cities?: any[];
  selectedCity?: any;
  userName?: string;
  terminals?: Terminal[];
  selectedBranch?: Terminal;
  ratings?: {
    product: number;
    service: number;
    delivery: number;
  };
  categories?: any[];
  selectedCategory?: any;
  products?: any[];
  selectedProduct?: any;
  currentProductsPage?: number;
  productQuantities?: {
    [productId: string]: number;
  };
}

interface Terminal {
  id: number;
  name: string;
  name_uz: string;
  name_en: string;
  desc: string;
  desc_uz: string;
  desc_en: string;
  active: boolean;
  city_id: number;
  address: string;
  address_uz: string;
  address_en: string;
  phone: string;
  location: string;
  latitude: string;
  longitude: string;
}

export interface MyContext extends Context {
  session: MySession;
  scene: Scenes.SceneContextScene<MyContext, MySceneSession>;
  i18n: TelegrafI18n;
} 