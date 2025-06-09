import axios from 'axios';

export async function sendSmsToPhone(phone: string, name: string, tg_id: number, hex: string): Promise<any> {
  try {
    const response = await axios.post(
      `${process.env.API_URL}ss_zz`,
      {
        phone,
        name,
        tg_id,
        source_type: "bot",
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${hex}`,
        },
        withCredentials: true,
      }
    );
    return response.data;
  } catch (error: any) {
    throw error.response?.data || error.message;
  }
} 