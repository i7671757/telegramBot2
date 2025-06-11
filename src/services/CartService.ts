import type { AuthContext } from '../middlewares/auth';

export interface CartItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
}

export interface Cart {
  items: CartItem[];
  total: number;
  updatedAt: string;
}

export class CartService {
  private static instance: CartService;
  private carts = new Map<number, Cart>();

  private constructor() {}

  static getInstance(): CartService {
    if (!CartService.instance) {
      CartService.instance = new CartService();
    }
    return CartService.instance;
  }

  /**
   * Получить или создать корзину для пользователя
   */
  getOrCreateCart(userId: number, ctx?: AuthContext): Cart {
    if (!this.carts.has(userId)) {
      // Попытаться восстановить корзину из сессии
      let cartData: Cart = { 
        items: [], 
        total: 0, 
        updatedAt: new Date().toISOString() 
      };
      
      if (ctx?.session?.cart) {
        cartData = {
          items: ctx.session.cart.items || [],
          total: ctx.session.cart.total || 0,
          updatedAt: ctx.session.cart.updatedAt || new Date().toISOString()
        };
        console.log(`Restored cart from session for user ${userId}: ${cartData.items.length} items, total: ${cartData.total}`);
      }
      
      this.carts.set(userId, cartData);
    }
    return this.carts.get(userId)!;
  }

  /**
   * Добавить товар в корзину
   */
  addItem(userId: number, item: Omit<CartItem, 'quantity'>, quantity: number = 1, ctx?: AuthContext): Cart {
    const cart = this.getOrCreateCart(userId, ctx);
    
    // Проверить, есть ли товар уже в корзине
    const existingItem = cart.items.find(cartItem => cartItem.id === item.id);
    
    if (existingItem) {
      existingItem.quantity += quantity;
      console.log(`Updated quantity for item ${item.name}: ${existingItem.quantity}`);
    } else {
      cart.items.push({
        ...item,
        quantity
      });
      console.log(`Added new item to cart: ${item.name} x${quantity}`);
    }
    
    this.recalculateTotal(cart);
    this.syncToSession(userId, ctx);
    
    return cart;
  }

  /**
   * Удалить товар из корзины
   */
  removeItem(userId: number, itemId: number, ctx?: AuthContext): Cart {
    const cart = this.getOrCreateCart(userId, ctx);
    
    cart.items = cart.items.filter(item => item.id !== itemId);
    this.recalculateTotal(cart);
    this.syncToSession(userId, ctx);
    
    console.log(`Removed item ${itemId} from cart for user ${userId}`);
    return cart;
  }

  /**
   * Изменить количество товара
   */
  updateQuantity(userId: number, itemId: number, quantity: number, ctx?: AuthContext): Cart {
    const cart = this.getOrCreateCart(userId, ctx);
    
    const item = cart.items.find(cartItem => cartItem.id === itemId);
    if (item) {
      if (quantity <= 0) {
        return this.removeItem(userId, itemId, ctx);
      }
      
      item.quantity = quantity;
      this.recalculateTotal(cart);
      this.syncToSession(userId, ctx);
      
      console.log(`Updated quantity for item ${itemId}: ${quantity}`);
    }
    
    return cart;
  }

  /**
   * Очистить корзину
   */
  clearCart(userId: number, ctx?: AuthContext): Cart {
    const cart: Cart = { 
      items: [], 
      total: 0, 
      updatedAt: new Date().toISOString() 
    };
    
    this.carts.set(userId, cart);
    this.syncToSession(userId, ctx);
    
    console.log(`Cleared cart for user ${userId}`);
    return cart;
  }

  /**
   * Получить корзину пользователя
   */
  getCart(userId: number, ctx?: AuthContext): Cart {
    return this.getOrCreateCart(userId, ctx);
  }

  /**
   * Проверить, пуста ли корзина
   */
  isEmpty(userId: number, ctx?: AuthContext): boolean {
    const cart = this.getOrCreateCart(userId, ctx);
    return cart.items.length === 0;
  }

  /**
   * Получить количество товаров в корзине
   */
  getItemCount(userId: number, ctx?: AuthContext): number {
    const cart = this.getOrCreateCart(userId, ctx);
    return cart.items.reduce((total, item) => total + item.quantity, 0);
  }

  /**
   * Пересчитать общую стоимость корзины
   */
  private recalculateTotal(cart: Cart): void {
    cart.total = cart.items.reduce((total, item) => total + (item.price * item.quantity), 0);
    cart.updatedAt = new Date().toISOString();
  }

  /**
   * Синхронизировать корзину с сессией
   */
  private syncToSession(userId: number, ctx?: AuthContext): void {
    if (ctx?.session) {
      const cart = this.carts.get(userId);
      if (cart) {
        ctx.session.cart = {
          items: cart.items,
          total: cart.total,
          updatedAt: cart.updatedAt
        };
        console.log(`Synced cart to session for user ${userId}: ${cart.items.length} items, total: ${cart.total}`);
      }
    }
  }

  /**
   * Форматировать корзину для отображения
   */
  formatCartMessage(userId: number, i18n: any, ctx?: AuthContext): string {
    const cart = this.getOrCreateCart(userId, ctx);
    
    if (cart.items.length === 0) {
      return i18n.t('cart.empty') || 'Ваша корзина пуста';
    }

    let cartMessage = `🛒 <b>${i18n.t('cart.title') || 'Ваша корзина'}:</b>\n\n`;

    cart.items.forEach((item, index) => {
      const itemTotal = item.price * item.quantity;
      const formattedItemTotal = new Intl.NumberFormat('ru-RU').format(itemTotal);
      const formattedPrice = new Intl.NumberFormat('ru-RU').format(item.price);
      
      cartMessage += `${index + 1}. ${item.name}\n`;
      cartMessage += `${item.quantity} × ${formattedPrice} = ${formattedItemTotal} ${i18n.t('cart.sum') || 'сум'}\n\n`;
    });

    const formattedTotal = new Intl.NumberFormat('ru-RU').format(cart.total);
    cartMessage += `<b>${i18n.t('cart.total') || 'Итого'}: ${formattedTotal} ${i18n.t('cart.sum') || 'сум'}</b>`;

    return cartMessage;
  }
}

// Экспортируем единственный экземпляр
export const cartService = CartService.getInstance(); 