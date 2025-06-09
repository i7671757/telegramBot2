import axios from 'axios';
import crypto from 'crypto';
import { config } from '../config';

export interface AuthUser {
  id: number;
  phone: string;
  name?: string;
  telegram_id: number;
  is_verified: boolean;
}

export interface OtpResponse {
  success: boolean;
  token?: string;
  message?: string;
  error?: string;
}

export interface AuthResponse {
  success: boolean;
  user?: AuthUser;
  token?: string;
  message?: string;
  error?: string;
}

/**
 * Проверка существования пользователя в системе
 */
export async function checkUserExists(telegramUser: any): Promise<boolean> {
  try {
    const response = await axios.post(
      `${config.api.baseUrl}${config.api.endpoints.checkTgExists}`,
      telegramUser,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data.result === true;
  } catch (error) {
    console.error('Error checking user existence:', error);
    return false;
  }
}

/**
 * Валидация номера телефона (только узбекские номера)
 */
export function validatePhoneNumber(phone: string): { isValid: boolean; formatted?: string; error?: string } {
  // Удаляем все пробелы и специальные символы
  const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
  
  // Проверяем формат узбекского номера
  const uzbekPhoneRegex = /^(\+998|998)?([0-9]{9})$/;
  const match = cleanPhone.match(uzbekPhoneRegex);
  
  if (!match) {
    return {
      isValid: false,
      error: 'Неверный формат номера. Используйте формат: +998XXXXXXXXX'
    };
  }
  
  // Форматируем номер в стандартный вид
  const formatted = `+998${match[2]}`;
  
  return {
    isValid: true,
    formatted
  };
}

/**
 * Отправка OTP кода
 */
export async function sendOtpCode(
  phone: string,
  telegramName: string,
  telegramId: number
): Promise<OtpResponse> {
  try {
    // Хешируем Telegram ID для безопасности
    const hashedTelegramId = crypto.createHash('sha256').update(telegramId.toString()).digest('hex');
    const requestData = {
      phone,
      name: telegramName,
      telegram_id: hashedTelegramId,
      source: 'bot'
    };
    const response = await axios.post(
      `${config.api.baseUrl}${config.api.endpoints.sendOtp}`,
      requestData,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    if (response.data.success) {
      return {
        success: true,
        token: response.data.token,
        message: 'OTP код отправлен'
      };
    } else {
      return {
        success: false,
        error: response.data.message || 'Ошибка отправки OTP'
      };
    }
  } catch (error) {
    console.error('Error sending OTP:', error);
    return {
      success: false,
      error: 'Ошибка сети при отправке OTP'
    };
  }
}

/**
 * Верификация OTP кода
 */
export async function verifyOtpCode(
  otpCode: string,
  otpToken: string
): Promise<AuthResponse> {
  try {
    const requestData = {
      otp: otpCode,
      token: otpToken
    };
    const response = await axios.post(
      `${config.api.baseUrl}${config.api.endpoints.verifyOtp}`,
      requestData,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    if (response.data.success) {
      return {
        success: true,
        user: response.data.user,
        token: response.data.auth_token,
        message: 'Авторизация успешна'
      };
    } else {
      return {
        success: false,
        error: response.data.message || 'Неверный OTP код'
      };
    }
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return {
      success: false,
      error: 'Ошибка сети при проверке OTP'
    };
  }
}

/**
 * Генерация случайного токена
 */
export function generateRandomToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Хеширование данных
 */
export function hashData(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
} 