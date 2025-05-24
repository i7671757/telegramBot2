// Category type definition
export interface Category {
  id: number;
  attribute_data: {
    name: {
      chopar: {
        ru: string;
        uz: string;
        en: string;
      }
    }
  };
  _lft: number;
  _rgt: number;
  parent_id: number | null;
  active: number;
  order: number;
  icon: string;
  asset?: Array<{
    link: string;
    title: string;
  }>;
}

// Response type definition
interface ApiResponse {
  success: boolean;
  data: Category[];
  message: string;
}



// Function to fetch categories from the API
export async function fetchCategories(): Promise<Category[]> {
  const apiUrl = 'https://api.lesailes.uz/api/categories/root';
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
    console.log(`Total categories in response: ${data.data?.length || 0}`);
    
    if (data.success && Array.isArray(data.data)) {
      const activeCategories = data.data.filter((category: Category) => category.active === 1);
      console.log(`Active categories: ${activeCategories.length}/${data.data.length}`);
      
      // Sort categories by the 'order' field
      const sortedCategories = activeCategories.sort((a, b) => a.order - b.order);
      
      // Log the first few categories for debugging
      if (sortedCategories.length > 0) {
        console.log(`First category example: ${JSON.stringify(sortedCategories[0])}`);
      }
      
      return sortedCategories;
    } else {
      console.log(`Invalid response format: ${JSON.stringify(data)}`);
      throw new Error(`Invalid response format: ${JSON.stringify(data)}`);
    }
  } catch (error) {
    console.error('Error fetching categories:', error);
    return [];
  }
}

// Get category name based on language
export function getCategoryName(category: Category, language: string): string {
  switch (language) {
    case 'uz':
      return category.attribute_data?.name?.chopar?.uz || '';
    case 'en':
      return category.attribute_data?.name?.chopar?.en || '';
    case 'ru':
    default:
      return category.attribute_data?.name?.chopar?.ru || '';
  }
}

// Get category image URL
export function getCategoryImageUrl(category: Category): string | null {
  if (category.asset && category.asset.length > 0 && category.asset[0]?.link) {
    return category.asset[0].link;
  }
  return null;
} 