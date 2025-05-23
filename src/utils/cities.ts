// City type definition
export interface City {
  id: number;
  name: string;
  name_uz: string;
  name_en?: string;
  slug: string;
  active: boolean;
}

// Response type definition
interface ApiResponse {
  success: boolean;
  data: City[];
  message: string;
}

// Function to fetch cities from the API
export async function fetchCities(): Promise<City[]> {
  const apiUrl = 'https://api.lesailes.uz/api/cities/public';
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
    console.log(`Total cities in response: ${data.data?.length || 0}`);
    console.log(`Raw response data: ${JSON.stringify(data)}`);
    
    if (data.success && Array.isArray(data.data)) {
      const activeCities = data.data.filter((city: City) => city.active);
      console.log(`Active cities: ${activeCities.length}/${data.data.length}`);
      
      // Log the first few cities for debugging
      if (activeCities.length > 0) {
        console.log(`First city example: ${JSON.stringify(activeCities[0])}`);
      }
      
      return activeCities;
    } else {
      console.log(`Invalid response format: ${JSON.stringify(data)}`);
      throw new Error(`Invalid response format: ${JSON.stringify(data)}`);
    }
  } catch (error) {
    console.error('Error fetching cities:', error);
    return [];
  }
}

// Get city name based on language
export function getCityName(city: City, language: string): string {
  switch (language) {
    case 'uz':
      return city.name_uz;
    case 'en':
      return city.name_en || city.name;
    case 'ru':
    default:
      return city.name;
  }
} 