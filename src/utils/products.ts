// Product type definition
export interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  image: string;
  active: boolean;
  category_id: number;
  attribute_data: {
    name: {
      chopar: {
        ru: string;
        uz: string;
        en: string;
      }
    },
    description: {
      chopar: {
        ru: string;
        uz: string;
        en: string;
      }
    }
  };
  asset?: Array<{
    link: string;
    title: string;
  }>;
}

// Response type definition
interface ApiResponse {
  success: boolean;
  data: Product[];
  message: string;
}

// Function to fetch products by category ID from the API
export async function fetchProductsByCategory(categoryId: string | number): Promise<Product[]> {
  const apiUrl = `https://api.lesailes.uz/api/category/${categoryId}/products`;
  console.log(`Making API request to: ${apiUrl}`);
  
  try {
    console.log('Starting API fetch...');
    const response = await fetch(apiUrl);
    
    console.log(`API response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      console.log(`Response not OK: ${response.status}`);
      throw new Error(`API request failed with status ${response.status}`);
    }
    
    console.log('Parsing JSON response...');
    const data = await response.json() as ApiResponse;
    
    console.log(`API response success: ${data.success}, message: ${data.message}`);
    console.log(`Total products in response: ${data.data?.length || 0}`);
    
    if (data.success && Array.isArray(data.data)) {
      const activeProducts = data.data.filter((product: Product) => product.active);
      console.log(`Active products: ${activeProducts.length}/${data.data.length}`);
      
      // Log the first few products for debugging
      if (activeProducts.length > 0) {
        console.log(`First product example: ${JSON.stringify(activeProducts[0])}`);
      }
      
      return activeProducts;
    } else {
      console.log(`Invalid response format: ${JSON.stringify(data)}`);
      throw new Error(`Invalid response format: ${JSON.stringify(data)}`);
    }
  } catch (error) {
    console.error('Error fetching products:', error);
    return [];
  }
}

// Get product name based on language
export function getProductName(product: Product, language: string): string {
  switch (language) {
    case 'uz':
      return product.attribute_data?.name?.chopar?.uz || product.name || '';
    case 'en':
      return product.attribute_data?.name?.chopar?.en || product.name || '';
    case 'ru':
    default:
      return product.attribute_data?.name?.chopar?.ru || product.name || '';
  }
}

// Get product description based on language
export function getProductDescription(product: Product, language: string): string {
  switch (language) {
    case 'uz':
      return product.attribute_data?.description?.chopar?.uz || product.description || '';
    case 'en':
      return product.attribute_data?.description?.chopar?.en || product.description || '';
    case 'ru':
    default:
      return product.attribute_data?.description?.chopar?.ru || product.description || '';
  }
}

// Get product image URL
export function getProductImageUrl(product: Product): string | null {
  console.log('Product image source check:');
  
  // Проверяем asset массив
  if (product.asset && product.asset.length > 0 && product.asset[0]?.link) {
    const assetUrl = product.asset[0].link;
    console.log(`Found asset URL: ${assetUrl}`);
    if (isValidUrl(assetUrl)) {
      return assetUrl;
    } else {
      console.log('Asset URL is invalid');
    }
  }
  
  // Проверяем поле image
  if (product.image && typeof product.image === 'string' && product.image.trim().length > 0) {
    console.log(`Found image URL: ${product.image}`);
    if (isValidUrl(product.image)) {
      return product.image;
    } else {
      console.log('Image URL is invalid');
    }
  }
  
  console.log('No valid image URL found for product:', product.id);
  return null;
}

// Функция проверки валидности URL
function isValidUrl(url: string): boolean {
  try {
    // Проверяем, что это действительно URL (начинается с http:// или https://)
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return false;
    }
    
    // Дополнительная проверка через URL constructor
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}

// Проверяет доступность изображения по URL
export async function checkImageAvailability(url: string): Promise<boolean> {
  try {
    console.log(`Checking image availability at: ${url}`);
    const response = await fetch(url, { method: 'HEAD' });
    
    if (response.ok) {
      const contentType = response.headers.get('content-type');
      // Проверяем, что это изображение
      if (contentType && contentType.startsWith('image/')) {
        console.log(`Image verified: ${url}, content-type: ${contentType}`);
        return true;
      } else {
        console.log(`URL is not an image: ${url}, content-type: ${contentType || 'unknown'}`);
        return false;
      }
    } else {
      console.log(`Image URL returned status ${response.status}: ${url}`);
      return false;
    }
  } catch (error) {
    console.error(`Error checking image URL: ${url}`, error);
    return false;
  }
}

/**
 * Fetches related products for a given product ID
 * @param productId - The ID of the product to fetch related products for
 * @returns An array of related products or null if there was an error
 */
export async function fetchRelatedProducts(productId: number | string | undefined): Promise<Product[] | null> {
  try {
    // If productId is undefined, use a default value or return an empty array
    if (productId === undefined) {
      console.error('ProductId is undefined in fetchRelatedProducts');
      return null;
    }
    
    const response = await fetch(`https://api.lesailes.uz/api/baskets/product_related/${productId}`);
    
    if (!response.ok) {
      console.error(`Error fetching related products: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const data = await response.json() as { 
      success: boolean; 
      data: Product[];
      message?: string;
    };
    
    if (data.success && Array.isArray(data.data)) {
      return data.data;
    } else {
      console.error('API returned unsuccessful response or invalid data format:', data);
      return null;
    }
  } catch (error) {
    console.error('Error fetching related products:', error);
    return null;
  }
} 