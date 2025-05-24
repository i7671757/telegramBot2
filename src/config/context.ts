import { Context, Scenes } from 'telegraf';
import TelegrafI18n from 'telegraf-i18n';
import { type Terminal } from '../utils/cities';

interface MySceneSession extends Scenes.SceneSessionData {
  // Add any custom scene session properties here
}

interface MySession extends Scenes.SceneSession<MySceneSession> {
  language?: string;
  registered?: boolean;
  phone?: string | null;
  currentCity?: string | null;
  cities?: any[];
  selectedCity?: number | string | null;
  userName?: string;
  terminals?: Terminal[];
  selectedBranch?: number | string | null;
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
  previousScene?: string;
}

export interface MyContext extends Context {
  session: MySession;
  scene: Scenes.SceneContextScene<MyContext, MySceneSession>;
  i18n: TelegrafI18n;
} 