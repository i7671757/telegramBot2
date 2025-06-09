const { match } = require("telegraf-i18n");
import { Scenes, Markup, Context } from 'telegraf';
import TelegrafI18n from 'telegraf-i18n';
import axios from 'axios';
import { fetchTerminals, getTerminalById, getTerminalName, getTerminalDesc, getTerminalAddress, type Terminal } from '../../utils/cities';
import type { AuthContext } from '../../middlewares/auth';
import { selectPickup, selectPickupBranch } from './helpers';

// Расширяем тип данных сессии для нашего контекста
interface MySessionData {
    address?: string;
    coordinates?: {
        latitude: number;
        longitude: number;
    };
    currentCity?: string;
    terminals?: Terminal[];
    selectedBranch?: number | string | null;
    deliveryType?: 'pickup' | 'delivery';
}

// Расширяем тип сессии сцены
interface MySceneSession extends Scenes.SceneSession {
    address?: string;
    coordinates?: {
        latitude: number;
        longitude: number;
    };
    currentCity?: string;
    terminals?: Terminal[];
    selectedBranch?: number | string | null;
}

// Функция для получения адреса по координатам
async function getAddressByCoordinates(latitude: number, longitude: number, language: string = 'ru'): Promise<string> {
    try {
        // Преобразуем язык в формат, понятный для Nominatim
        const acceptLanguage = language === 'uz' ? 'uz,ru' : language; // Если узбекский, добавляем русский как запасной
        
        // Используем Nominatim OpenStreetMap API для геокодирования
        const response = await axios.get(`https://nominatim.openstreetmap.org/reverse`, {
            params: {
                format: 'json',
                lat: latitude,
                lon: longitude,
                'accept-language': acceptLanguage,
                addressdetails: 1,  // Получаем детальную информацию об адресе
                zoom: 18,           // Высокий уровень масштабирования для более точного адреса
                namedetails: 1      // Получаем детали именования объектов
            },
            headers: {
                'User-Agent': 'TelegramBot/1.0' // Nominatim требует User-Agent
            }
        });

        if (response.data && response.data.display_name) {
            // Можно использовать форматирование адреса на основе деталей
            // для создания более читаемого формата
            if (response.data.address) {
                const address = response.data.address;
                
                // Форматируем адрес в зависимости от языка
                if (language === 'ru' || language === 'uz') {
                    // Формат для русского и узбекского
                    const formattedParts = [];
                    
                    if (address.country) formattedParts.push(address.country);
                    if (address.city) formattedParts.push(address.city);
                    if (address.road) formattedParts.push(address.road);
                    if (address.house_number) formattedParts.push(address.house_number);
                    
                    if (formattedParts.length > 0) {
                        return formattedParts.join(', ');
                    }
                } else {
                    // Формат для английского
                    const formattedParts = [];
                    
                    if (address.house_number) formattedParts.push(address.house_number);
                    if (address.road) formattedParts.push(address.road);
                    if (address.city) formattedParts.push(address.city);
                    if (address.country) formattedParts.push(address.country);
                    
                    if (formattedParts.length > 0) {
                        return formattedParts.join(', ');
                    }
                }
            }
            
            // Если не удалось сформатировать адрес, возвращаем полный адрес
            return response.data.display_name;
        } else {
            console.error('Не удалось получить адрес из ответа API:', response.data);
            return language === 'ru' ? "Адрес не определен" : 
                   language === 'en' ? "Address not determined" : 
                   "Manzil aniqlanmadi";
        }
    } catch (error) {
        console.error('Ошибка при получении адреса:', error);
        return language === 'ru' ? "Ошибка при определении адреса" : 
               language === 'en' ? "Error determining address" : 
               "Manzilni aniqlashda xatolik";
    }
}

export const startOrderScene = new Scenes.BaseScene<AuthContext>('startOrder');


startOrderScene.command('start', async (ctx) => {
 // Leave the current scene to return to the global context
 await ctx.scene.leave();
  
 // Now pass control to the global /start command handler
 // This will trigger the global handler which resets the session
 await ctx.reply(ctx.i18n.t('bot_restarted') || 'Bot has been restarted. Starting from the beginning...');
 
 // Go to language selection scene (now called start scene)
 return ctx.scene.enter('start');
});

// Добавляем обработчики команд
startOrderScene.command('feedback', async (ctx) => {
  console.log('Feedback command received in startOrder scene, switching to callback scene');
  return ctx.scene.enter('callback');
});


startOrderScene.command('settings', async (ctx) => {
  await ctx.scene.enter('settings');
});


startOrderScene.command('order', async (ctx) => {
    await ctx.scene.reenter();
});


startOrderScene.enter(async (ctx) => {
    console.log('Entering startOrder scene');

    const keyboard = Markup.keyboard([
        [ctx.i18n.t('startOrder.deliveryType.pickup'), ctx.i18n.t('startOrder.deliveryType.deliver')],
        [ctx.i18n.t('startOrder.back')]
    ]).resize();

    console.log('Sending menu.title message with keyboard');
    // Используем parse_mode: "HTML" вместо replyWithHTML для явного указания формата
    await ctx.reply(
        ctx.i18n.t('startOrder.firstText'),
        { 
            parse_mode: "HTML",
            ...keyboard
        });
});

// Top-level back button handler
startOrderScene.hears(match('startOrder.back'), async (ctx) => {
    switch ((ctx.session as any).step) {
        case 'pickup':
            delete (ctx.session as any).deliveryType;
            delete (ctx.session as any).step;
            return ctx.scene.reenter();
        case 'delivery':
            delete (ctx.session as any).deliveryType;
            delete (ctx.session as any).step;
            return ctx.scene.reenter();
        case 'pickup.chooseBranch':
            (ctx.session as any).step = "pickup";
            (ctx.session as any).deliveryType = "pickup";
            return selectPickup(ctx);
    }
    console.log('Back button pressed in startOrder scene');
    return ctx.scene.enter('mainMenu');
});

// Handler for pickup mode back button
startOrderScene.hears(match('startOrder.pickup.back'), async (ctx) => {
    console.log('Back button pressed in pickup mode');
    return ctx.scene.reenter();
});

startOrderScene.hears(match('startOrder.deliveryType.pickup'), selectPickup);

startOrderScene.hears(match('startOrder.pickup.orderHere'), async (ctx) => {
    return ctx.reply(
        ctx.i18n.t('startOrder.pickup.orderHereText'),
        Markup.inlineKeyboard([
            Markup.button.url(ctx.i18n.t("goTo"), "https://lesailes.uz/"),
          ])
    );
});

// Handler for the getLocation button in pickup mode - УДАЛЁН, так как теперь кнопка сразу запрашивает локацию

// Handler for delivery option
startOrderScene.hears(match('startOrder.deliveryType.deliver'), async (ctx) => {
    // Save delivery type in session
    (ctx.session as any).deliveryType = 'delivery';
    (ctx.session as any).step = 'delivery';
    console.log('User selected delivery type');
    
    // Create keyboard for delivery option
    const deliveryKeyboard = Markup.keyboard([
        [ctx.i18n.t('startOrder.delivery.myAddress'), Markup.button.locationRequest(ctx.i18n.t('startOrder.delivery.sendLocation'))],
        [ctx.i18n.t('startOrder.delivery.back')]
    ]).resize();
    
    await ctx.reply(
        ctx.i18n.t('startOrder.delivery.text'),
        { 
            parse_mode: "HTML",
            ...deliveryKeyboard
        }
    );
});


// Handler for myAddress button
startOrderScene.hears(match('startOrder.delivery.myAddress'), async (ctx) => {
    // Читаем файл sessions.json для получения сохраненных адресов
    const fs = require('fs');
    try {
        // Вывод для отладки
        console.log('Нажата кнопка "Мои адреса"');
        
        // Получаем ID пользователя и чата для поиска в sessions.json
        const userId = ctx.from.id;
        const chatId = ctx.chat.id;
        const sessionKey = `${userId}:${chatId}`;
        
        console.log(`Ищем сессию с ключом: ${sessionKey}`);
        
        // Читаем файл с сессиями
        const sessionsFile = fs.readFileSync('sessions.json', 'utf8');
        const sessions = JSON.parse(sessionsFile);
        
        // Ищем сессию пользователя
        // Добавляем интерфейс для структуры сессии
        interface SessionData {
            id: string;
            data: any;
        }
        
        const userSession = sessions.sessions.find((s: SessionData) => s.id === sessionKey);
        console.log('Найдена сессия:', userSession ? 'Да' : 'Нет');
        
        if (userSession && userSession.data && userSession.data.location) {
            // Если найден сохраненный адрес
            const location = userSession.data.location;
            console.log('Найдена локация:', location);
            
            // Создаем клавиатуру с опциями использования этого адреса или отправки нового
            const locationKeyboard = Markup.keyboard([
                [Markup.button.text(ctx.i18n.t('startOrder.delivery.useThisAddress'))],
                [Markup.button.locationRequest(ctx.i18n.t('startOrder.delivery.sendLocation'))],
                [ctx.i18n.t('startOrder.delivery.back')]
            ]).resize();
            
            // Отправляем сообщение только с адресом без показа локации на карте
            await ctx.reply(ctx.i18n.t('startOrder.delivery.savedAddress', { 
                address: location.address 
            }), locationKeyboard);
            
            // Сохраняем адрес в текущей сессии для дальнейшего использования
            ctx.session.address = location.address;
            ctx.session.coordinates = { 
                latitude: location.latitude, 
                longitude: location.longitude 
            };
        } else {
            // Проверяем, есть ли локация в текущей сессии
            if (ctx.session?.address && ctx.session?.coordinates) {
                console.log('Найдена локация в текущей сессии');
                
                // Создаем клавиатуру с опциями использования этого адреса или отправки нового
                const locationKeyboard = Markup.keyboard([
                    [Markup.button.text(ctx.i18n.t('startOrder.delivery.useThisAddress'))],
                    [Markup.button.locationRequest(ctx.i18n.t('startOrder.delivery.sendLocation'))],
                    [ctx.i18n.t('startOrder.delivery.back')]
                ]).resize();
                
                // Отправляем сообщение только с адресом без показа локации на карте
                await ctx.reply(ctx.i18n.t('startOrder.delivery.savedAddress', { 
                    address: ctx.session.address 
                }), locationKeyboard);
            } else {
                // Если адрес не найден, предлагаем отправить локацию
                console.log('Локация не найдена');
                await ctx.reply(ctx.i18n.t('startOrder.delivery.noAddressFound'));
                
                // Клавиатура для отправки локации
                const addAddressKeyboard = Markup.keyboard([
                    [Markup.button.locationRequest(ctx.i18n.t('startOrder.delivery.sendLocation'))],
                    [ctx.i18n.t('startOrder.delivery.back')]
                ]).resize();
                
                await ctx.reply(ctx.i18n.t('startOrder.delivery.addNewAddress'), addAddressKeyboard);
            }
        }
    } catch (error) {
        console.error('Ошибка при чтении сохраненных адресов:', error);
        
        // В случае ошибки просто предлагаем отправить локацию
        await ctx.reply(ctx.i18n.t('startOrder.delivery.noAddressFound'));
        
        const addAddressKeyboard = Markup.keyboard([
            [Markup.button.locationRequest(ctx.i18n.t('startOrder.delivery.sendLocation'))],
            [ctx.i18n.t('startOrder.delivery.back')]
        ]).resize();
        
        await ctx.reply(ctx.i18n.t('startOrder.delivery.addNewAddress'), addAddressKeyboard);
    }
});

// Обработчик для кнопки "Использовать этот адрес"
startOrderScene.hears(match('startOrder.delivery.useThisAddress'), async (ctx) => {
    if (ctx.session?.address && ctx.session?.coordinates) {
        // Пользователь выбрал использовать сохраненный адрес
        console.log(`Пользователь выбрал использовать сохраненный адрес: ${ctx.session.address}`);
        
        // Create confirmation keyboard for saved address
        const confirmKeyboard = Markup.keyboard([
            [ ctx.i18n.t('startOrder.location.back'), ctx.i18n.t('startOrder.location.confirm')],
            [ctx.i18n.t('startOrder.location.sendAgain')]
        ]).resize();
        
        // Show address confirmation dialog
        await ctx.reply(ctx.i18n.t('startOrder.location.addressConfirmation', { 
            address: ctx.session.address 
        }));
        
        // Ask for confirmation
        await ctx.reply(ctx.i18n.t('startOrder.location.confirmLocation'), confirmKeyboard);
    } else {
        // Если по какой-то причине в сессии нет адреса или координат, просим отправить локацию
        const addAddressKeyboard = Markup.keyboard([
            [Markup.button.locationRequest(ctx.i18n.t('startOrder.delivery.sendLocation'))],
            [ctx.i18n.t('startOrder.delivery.back')]
        ]).resize();
        
        await ctx.reply(ctx.i18n.t('startOrder.delivery.noAddressFound'), addAddressKeyboard);
    }
});

// Handle location when user shares it
startOrderScene.on('location', async (ctx) => {
    const { latitude, longitude } = ctx.message.location;
    
    // Log the received location coordinates
    console.log(`User shared location: ${latitude}, ${longitude}`);
    
    // Inform the user that their location was received and being processed
    await ctx.reply(ctx.i18n.t('startOrder.location.processing'));
    
    // Получаем текущий язык пользователя
    const userLanguage = ctx.i18n.locale();
    
    // Получаем реальный адрес по координатам на языке пользователя
    const address = await getAddressByCoordinates(latitude, longitude, userLanguage);
    
    // Сохраняем адрес в сессии для последующего использования
    if (ctx.session) {
        ctx.session.address = address;
        ctx.session.coordinates = { latitude, longitude };
    }
    
    // Отправляем пользователю адрес, полученный из координат, и запрашиваем подтверждение
    await ctx.reply(ctx.i18n.t('startOrder.location.addressConfirmation', { address }));
    
    // Create confirmation keyboard
    const confirmKeyboard = Markup.keyboard([
        [ctx.i18n.t('startOrder.location.back'), ctx.i18n.t('startOrder.location.confirm')],
        [ctx.i18n.t('startOrder.location.sendAgain')]
    ]).resize();
    
    // Ask for confirmation
    await ctx.reply(ctx.i18n.t('startOrder.location.confirmLocation'), confirmKeyboard);
});

// Handler for location confirmation
startOrderScene.hears(match('startOrder.location.confirm'), async (ctx) => {
    console.log('User confirmed location');
    
    // Save coordinates in session file
    const fs = require('fs');
    let sessions;
    
    try {
        // Read current sessions from file
        const sessionsFile = fs.readFileSync('sessions.json', 'utf8');
        sessions = JSON.parse(sessionsFile);
        
        // Find user session by ID or create new one
        const userId = ctx.from.id;
        const chatId = ctx.chat.id;
        const sessionKey = `${userId}:${chatId}`;
        
        interface SessionData {
            id: string;
            data: any;
        }

        const userSession = sessions.sessions.find((s: SessionData) => s.id === sessionKey);
        
        if (userSession && ctx.session?.coordinates && ctx.session?.address) {
            // Save coordinates to existing session
            userSession.data.location = {
                latitude: ctx.session.coordinates.latitude,
                longitude: ctx.session.coordinates.longitude,
                address: ctx.session.address
            };
        } else if (ctx.session?.coordinates && ctx.session?.address) {
            // If session doesn't exist, add a new one
            sessions.sessions.push({
                id: sessionKey,
                data: {
                    location: {
                        latitude: ctx.session.coordinates.latitude,
                        longitude: ctx.session.coordinates.longitude,
                        address: ctx.session.address
                    }
                }
            });
        }
        
        // Write updated sessions back to file
        fs.writeFileSync('sessions.json', JSON.stringify(sessions, null, 2));
        console.log(`Coordinates successfully saved for user ${sessionKey}`);
    } catch (error) {
        console.error('Error saving coordinates:', error);
    }
    
    // Continue to the categories scene
    return ctx.scene.enter('categories');
});

// Handler for the "Send location again" button
startOrderScene.hears(match('startOrder.location.sendAgain'), async (ctx) => {
    console.log('User requested to send location again');
    
    // Create keyboard for location sending
    const locationKeyboard = Markup.keyboard([
        [ctx.i18n.t('startOrder.delivery.back'), Markup.button.locationRequest(ctx.i18n.t('startOrder.delivery.sendLocation'))]
    ]).resize();
    
    await ctx.reply(ctx.i18n.t('startOrder.delivery.text'), {
        parse_mode: "HTML",
        ...locationKeyboard
    });
});

// Handler for selecting a branch
startOrderScene.hears(match('startOrder.pickup.selectBranch'), selectPickupBranch);
// Handle branch selection after "Filiallarni tanlash"
startOrderScene.on('text', async (ctx) => {
    const text = ctx.message.text;

    // Skip processing if it's a command or a special button
    if (text === ctx.i18n.t('startOrder.back') ||
        text === ctx.i18n.t('startOrder.pickup.orderHere') || 
        text === ctx.i18n.t('startOrder.pickup.selectBranch') ||
        text === ctx.i18n.t('startOrder.deliveryType.pickup') ||
        text === ctx.i18n.t('startOrder.deliveryType.deliver') ||
        text === ctx.i18n.t('startOrder.pickup.back') ||
        text === ctx.i18n.t('startOrder.delivery.back') ||
        text.startsWith('/')) {
        return;
    }

    // Get terminals from session
    const terminals = ctx.session?.terminals || [];
    const language = ctx.i18n.locale();

    if (terminals.length === 0) {
        return; // No terminals in session, likely not in branch selection mode
    }

    // Find selected terminal
    const selectedTerminal = terminals.find(terminal => 
        getTerminalName(terminal, language) === text
    );

    if (selectedTerminal) {
        // Format branch information
        const branchName = getTerminalName(selectedTerminal, language);
        const branchDesc = getTerminalDesc(selectedTerminal, language);
        const branchAddress = getTerminalAddress(selectedTerminal, language) || branchDesc; // Use desc as fallback

        // Log complete terminal info for debugging
        console.log('Selected terminal details:', {
            id: selectedTerminal.id,
            name: branchName,
            desc: branchDesc,
            address: branchAddress,
            city_id: selectedTerminal.city_id,
            latitude: selectedTerminal.latitude,
            longitude: selectedTerminal.longitude
        });

        // Save only the selected branch in session (not the full terminals array)
        ctx.session.selectedBranch = selectedTerminal.id;
        // After selecting a branch, we don't need the full terminals list anymore
        ctx.session.terminals = undefined;

        // Display branch name and address to the user
        await ctx.reply(`${branchName}\n${branchAddress}`);

        // If coordinates are available, send location
        if (selectedTerminal.latitude && selectedTerminal.longitude) {
            const lat = parseFloat(selectedTerminal.latitude);
            const lon = parseFloat(selectedTerminal.longitude);
            if (!isNaN(lat) && !isNaN(lon)) {
                console.log(`Sending location for ${branchName}: lat=${lat}, lon=${lon}`);
                await ctx.replyWithLocation(lat, lon);
            } else {
                console.log(`Invalid coordinates for ${branchName}: lat=${selectedTerminal.latitude}, lon=${selectedTerminal.longitude}`);
            }
        } else {
            console.log(`No coordinates available for ${branchName}`);
        }

        // Immediately proceed to categories scene, skipping confirmation
        // await ctx.reply(ctx.i18n.t('startOrder.pickup.processingLocation'));
        // await ctx.reply(ctx.i18n.t('startOrder.redirecting_to_categories'));
        return ctx.scene.enter('categories');
    }
});
