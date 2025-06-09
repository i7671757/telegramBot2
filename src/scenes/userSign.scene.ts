import { Scenes, Markup } from 'telegraf';
import { message } from 'telegraf/filters';
import type { AuthContext } from '../middlewares/auth';
import { 
  validatePhoneNumber, 
  sendOtpCode, 
  verifyOtpCode,
  checkUserExists 
} from '../utils/auth';
import { config } from '../config';
import { sendSmsToPhone } from '../utils/sms';
import { axios, initAxiosWithCsrf } from '../utils/axios';

// Создаем сцену авторизации
export const userSignScene = new Scenes.BaseScene<AuthContext>('user_sign');

// Глобальный кэш городов
let cachedCities: any[] = [];

// Вход в сцену авторизации
userSignScene.enter(async (ctx) => {
  // Инициализация CSRF и axios
  await initAxiosWithCsrf();

  // Загрузка городов, если еще не загружены
  if (cachedCities.length === 0) {
    try {
      const { data } = await axios.get(`${process.env.API_URL}cities/public`);
      cachedCities = data.data || [];
    } catch (e) {
      console.error('Ошибка загрузки городов:', e);
      ctx.reply('Ошибка загрузки городов. Попробуйте позже.');
      return;
    }
  }

  console.log('Entering user sign scene');
  
  // Инициализируем сессию если необходимо
  if (!ctx.session) {
    ctx.session = {
      language: ctx.from?.language_code || 'ru',
      registered: false,
      phone: null,
      currentCity: null,
      selectedCity: null,
      isAuthenticated: false,
      otpRetries: 0
    };
  }

  // Проверяем, может пользователь уже существует
  try {
    const userExists = await checkUserExists(ctx.from);
    if (userExists) {
      ctx.session.isAuthenticated = true;
      ctx.reply(ctx.i18n.t('auth.already_authorized'));
      return ctx.scene.enter('welcome');
    }
  } catch (error) {
    console.error('Error checking user existence:', error);
  }

  // Создаем клавиатуру с кнопкой "Поделиться контактом"
  const keyboard = Markup.keyboard([
    [Markup.button.contactRequest(ctx.i18n.t('auth.share_contact'))]
  ]).resize();

  const welcomeMessage = `
${ctx.i18n.t('auth.welcome_title')}

${ctx.i18n.t('auth.welcome_message')}

${ctx.i18n.t('auth.instructions')}

${ctx.i18n.t('auth.uzbek_only')}
  `;

  ctx.reply(welcomeMessage, {
    parse_mode: 'Markdown',
    ...keyboard
  });
});

// Обработка контакта
userSignScene.on(message('contact'), async (ctx) => {
  const contact = ctx.message.contact;
  const phone = contact.phone_number;

  // Добавляем + если его нет
  const formattedPhone = phone.startsWith('+') ? phone : `+${phone}`;
  
  // Валидируем номер
  const validation = validatePhoneNumber(formattedPhone);
  
  if (!validation.isValid) {
    ctx.reply(`${validation.error}\n\n${ctx.i18n.t('auth.uzbek_phone_required')}`);
    return;
  }

  // Сохраняем номер в сессии
  ctx.session.phone = validation.formatted;

  // Отправляем SMS через API
  try {
    const hex = process.env.SMS_API_TOKEN || '';
    await sendSmsToPhone(
      ctx.session.phone,
      `${ctx.from?.last_name || ''} ${ctx.from?.first_name || ''}`.trim(),
      ctx.from?.id || 0,
      hex
    );
    ctx.reply('SMS успешно отправлено!');
  } catch (err) {
    ctx.reply('Ошибка при отправке SMS: ' + err);
  }
  
  // Отправляем OTP
  await sendOtpToUser(ctx, validation.formatted!);
});

// Обработка текстового ввода номера телефона
userSignScene.on(message('text'), async (ctx) => {
  const text = ctx.message.text;

  // Проверяем команды
  if (text === '/start') {
    return ctx.scene.enter('start');
  }

  if (text === '/cancel') {
    ctx.reply(ctx.i18n.t('auth.auth_cancelled'));
    return ctx.scene.leave();
  }

  // Если уже есть номер в сессии, значит ожидаем OTP код
  if (ctx.session.phone && ctx.session.otpToken) {
    await verifyOtp(ctx, text);
    return;
  }

  // Иначе обрабатываем как номер телефона
  const validation = validatePhoneNumber(text);
  
  if (!validation.isValid) {
    ctx.reply(`${validation.error}\n\n${ctx.i18n.t('auth.enter_phone_manual')}`);
    return;
  }

  // Сохраняем номер в сессии
  ctx.session.phone = validation.formatted;
  
  // Отправляем OTP
  await sendOtpToUser(ctx, validation.formatted!);
});

// Функция отправки OTP
async function sendOtpToUser(ctx: AuthContext, phone: string) {
  try {
    // Проверяем лимит попыток
    const now = Date.now();
    const retryWindow = 60000; // 1 минута между отправками
    
    if (ctx.session.lastOtpSent && (now - ctx.session.lastOtpSent) < retryWindow) {
      const timeLeft = Math.ceil((retryWindow - (now - ctx.session.lastOtpSent)) / 1000);
      ctx.reply(ctx.i18n.t('auth.wait_before_resend', { seconds: timeLeft }));
      return;
    }

    ctx.reply(ctx.i18n.t('auth.sending_otp'));

    const telegramName = ctx.from?.first_name || ctx.from?.username || 'User';
    const telegramId = ctx.from?.id || 0;

    const otpResponse = await sendOtpCode(phone, telegramName, telegramId);

    if (otpResponse.success && otpResponse.token) {
      ctx.session.otpToken = otpResponse.token;
      ctx.session.otp = otpResponse.token; // Сохраняем токен для дальнейшей проверки
      ctx.session.lastOtpSent = now;
      ctx.session.otpRetries = (ctx.session.otpRetries || 0) + 1;

      const keyboard = Markup.keyboard([
        [ctx.i18n.t('auth.resend_otp')],
        [ctx.i18n.t('auth.change_phone')],
        [ctx.i18n.t('auth.cancel')]
      ]).resize();

      ctx.reply(
        `${ctx.i18n.t('auth.otp_sent', { phone })}\n\n` +
        `${ctx.i18n.t('auth.enter_otp', { length: config.auth.otpLength })}`,
        keyboard
      );
    } else {
      ctx.reply(ctx.i18n.t('auth.otp_error', { error: otpResponse.error }));
    }
  } catch (error) {
    console.error('Error sending OTP:', error);
    ctx.reply(ctx.i18n.t('auth.otp_network_error'));
  }
}

// Функция верификации OTP (заменено на ваш рабочий пример)
async function verifyOtp(ctx: AuthContext, otpCode: string) {
  const errors = {
    opt_code_is_incorrect: ctx.i18n.t('auth.otp_verification_error', { error: ctx.i18n.t('auth.otp_invalid_format') })
  };
  const otpToken = ctx.session.otp;
  try {
    let ress = await axios.post(
      `${process.env.API_URL}auth_otp`,
      {
        phone: ctx.session.phone,
        code: otpCode,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${otpToken}`,
        },
        withCredentials: true,
      }
    );

    let {
      data: { result },
    } = ress;
    result = Buffer.from(result, "base64");
    result = result.toString();
    result = JSON.parse(result);

    if (result === false) {
      return ctx.replyWithHTML(errors.opt_code_is_incorrect);
    } else {
      // После успешной авторизации — выбор города
      await promptCitySelection(ctx);
    }
    return;
  } catch (error) {
    return ctx.replyWithHTML(errors.opt_code_is_incorrect);
  }
}

// Обработка кнопок
userSignScene.action(/.*/, async (ctx) => {
  const action = ctx.match[0];
  
  switch (action) {
    case 'resend_otp':
      if (ctx.session.phone) {
        await sendOtpToUser(ctx, ctx.session.phone);
      }
      break;
      
    case 'change_phone':
      ctx.session.phone = null;
      ctx.session.otpToken = undefined;
      ctx.scene.reenter();
      break;
      
    case 'cancel_auth':
      ctx.reply(ctx.i18n.t('auth.auth_cancelled'));
      ctx.scene.leave();
      break;
  }
  
  ctx.answerCbQuery();
});

// Обработка текстовых команд-кнопок
userSignScene.hears('🔄 Отправить код повторно', async (ctx) => {
  if (ctx.session.phone) {
    await sendOtpToUser(ctx, ctx.session.phone);
  } else {
    ctx.reply(ctx.i18n.t('auth.phone_not_found'));
    ctx.scene.reenter();
  }
});

userSignScene.hears('📞 Изменить номер телефона', (ctx) => {
  ctx.session.phone = null;
  ctx.session.otpToken = undefined;
  delete ctx.session.otpRetries;
  delete ctx.session.lastOtpSent;
  ctx.scene.reenter();
});

userSignScene.hears('❌ Отменить', (ctx) => {
  ctx.reply(ctx.i18n.t('auth.auth_cancelled'));
  ctx.scene.leave();
});

// Выход из сцены
userSignScene.leave((ctx) => {
  console.log('Leaving user sign scene');
});

// После успешной авторизации — шаг выбора города
async function promptCitySelection(ctx: AuthContext) {
  // Определяем язык пользователя
  const lang = ctx.session.language || 'ru';
  // Формируем массив кнопок с городами на нужном языке
  const cityButtons = cachedCities.map(city => {
    let cityName = city.name;
    if (lang === 'uz' && city.name_uz) cityName = city.name_uz;
    if (lang === 'en' && city.name_en) cityName = city.name_en;
    return [Markup.button.callback(cityName, `city_${city.id}`)];
  });
  await ctx.reply(ctx.i18n.t('auth.choose_city'), Markup.inlineKeyboard(cityButtons));
}

// Обработка выбора города через callback-кнопку
userSignScene.action(/^city_\d+$/, async (ctx) => {
  const cityId = Number(ctx.match[0].replace('city_', ''));
  const city = cachedCities.find(c => c.id === cityId);
  if (!city) {
    await ctx.reply('Город не найден.');
    return;
  }
  ctx.session.currentCity = city.id;
  ctx.session.selectedCity = city.id;
  // Проверка пользователя через API (если нужно)
  // const { data } = await axios.post(`${process.env.API_URL}check_tg_exists`, ctx.from);
  // if (data.result) { ... }
  await ctx.replyWithHTML(ctx.i18n.t("mainMenu"));
  // Можно вызвать getMainKeyboard(ctx) если нужно
  return ctx.scene.enter('welcome');
}); 