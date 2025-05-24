// City type definition
export interface City {
  id: number;
  name: string;
  name_uz: string;
  name_en?: string;
  slug: string;
  active: boolean;
}

// Terminal type definition
export interface Terminal {
  id: number;
  name: string;
  name_uz: string;
  name_en: string;
  desc: string;
  desc_uz: string;
  desc_en: string;
  active: boolean;
  city_id: number;
  address?: string;
  address_uz?: string;
  address_en?: string;
  phone?: string;
  location?: string;
  latitude: string;
  longitude: string;
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

// Function to get city by ID
export async function getCityById(cityId: number | string): Promise<City | null> {
  try {
    const cities = await fetchCities();
    const city = cities.find(city => city.id.toString() === cityId.toString());
    return city || null;
  } catch (error) {
    console.error('Error getting city by ID:', error);
    return null;
  }
}

// Function to fetch terminals from the API
export async function fetchTerminals(): Promise<Terminal[]> {
  const apiUrl = 'https://api.lesailes.uz/api/terminals';
  console.log(`Making API request to: ${apiUrl}`);
  
  try {
    console.log('Starting terminals API fetch...');
    const response = await fetch(apiUrl);
    
    console.log(`Terminals API response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      console.log(`Response not OK: ${response.status}`);
      throw new Error(`API request failed with status ${response.status}`);
    }
    
    console.log('Parsing terminals JSON response...');
    const data = await response.json() as { data: Terminal[] };
    
    console.log(`Total terminals in response: ${data.data?.length || 0}`);
    
    if (Array.isArray(data.data)) {
      const activeTerminals = data.data.filter((terminal: Terminal) => terminal.active);
      console.log(`Active terminals: ${activeTerminals.length}/${data.data.length}`);
      
      return activeTerminals;
    } else {
      console.log(`Invalid terminals response format: ${JSON.stringify(data)}`);
      throw new Error(`Invalid response format: ${JSON.stringify(data)}`);
    }
  } catch (error) {
    console.error('Error fetching terminals:', error);
    return [];
  }
}

// Function to get terminal by ID
export async function getTerminalById(terminalId: number | string): Promise<Terminal | null> {
  try {
    const terminals = await fetchTerminals();
    const terminal = terminals.find(terminal => terminal.id.toString() === terminalId.toString());
    return terminal || null;
  } catch (error) {
    console.error('Error getting terminal by ID:', error);
    return null;
  }
}

// Get terminal name based on language
export function getTerminalName(terminal: Terminal, language: string): string {
  switch (language) {
    case 'uz':
      return terminal.name_uz || terminal.name;
    case 'en':
      return terminal.name_en || terminal.name;
    case 'ru':
    default:
      return terminal.name;
  }
}

// Get terminal description based on language
export function getTerminalDesc(terminal: Terminal, language: string): string {
  switch (language) {
    case 'uz':
      return terminal.desc_uz || terminal.desc;
    case 'en':
      return terminal.desc_en || terminal.desc;
    case 'ru':
    default:
      return terminal.desc;
  }
}

// Get terminal address based on language
export function getTerminalAddress(terminal: Terminal, language: string): string {
  switch (language) {
    case 'uz':
      return terminal.address_uz || terminal.address || terminal.desc_uz || terminal.desc;
    case 'en':
      return terminal.address_en || terminal.address || terminal.desc_en || terminal.desc;
    case 'ru':
    default:
      return terminal.address || terminal.desc;
  }
} 