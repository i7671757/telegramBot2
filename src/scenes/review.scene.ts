import { Markup, Scenes } from "telegraf";
import type { MyContext } from "../config/context";
import TelegrafI18n from 'telegraf-i18n';
const { match } = require("telegraf-i18n");

export const reviewScene = new Scenes.BaseScene<MyContext>('review');

// Initialize ratings object in session
reviewScene.enter(async (ctx) => {
    // Initialize ratings if they don't exist
    ctx.session.ratings = {
        product: 0,
        service: 0,
        delivery: 0
    };

    await ctx.replyWithHTML(
        ctx.i18n.t('review.title'),
        Markup.removeKeyboard()
    );

    // Show all three rating sections at once, like in the image
    const mahsulotKeyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('1 😣', 'product_rating_1'),
            Markup.button.callback('2 ☹️', 'product_rating_2'),
            Markup.button.callback('3 😕', 'product_rating_3'),
            Markup.button.callback('4 😑', 'product_rating_4'),
            Markup.button.callback('5 😍', 'product_rating_5'),
        ]
    ]);

    const xizmatKeyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('1 👊🏻', 'service_rating_1'),
            Markup.button.callback('2 👎🏻', 'service_rating_2'),
            Markup.button.callback('3 👌🏻', 'service_rating_3'),
            Markup.button.callback('4 🤙🏻', 'service_rating_4'),
            Markup.button.callback('5 👍🏻', 'service_rating_5'),
        ]
    ]);

    const deliveryKeyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('1 🐌', 'delivery_rating_1'),
            Markup.button.callback('2 🐢', 'delivery_rating_2'),
            Markup.button.callback('3 🛺', 'delivery_rating_3'),
            Markup.button.callback('4 🏎-', 'delivery_rating_4'),
            Markup.button.callback('5 🚀', 'delivery_rating_5'),
        ]
    ]);

    // Send each section with the category name
    await ctx.reply('Mahsulot', mahsulotKeyboard);
    await ctx.reply('Xizmat', xizmatKeyboard);
    await ctx.reply('Yetkazib berish', deliveryKeyboard);

    // Message at the bottom explaining the rating system
    await ctx.replyWithHTML(ctx.i18n.t('review.explanation'));
});

// Handle product rating
reviewScene.action(/product_rating_(\d)/, async (ctx) => {
    const rating = parseInt(ctx.match[1] || '0');
    if (ctx.session.ratings) {
        ctx.session.ratings.product = rating;
    }
    
    // Acknowledge the selection
    await ctx.answerCbQuery(ctx.i18n.t('review.rating_received'));
    
    // We won't update the message text with stars
    // await ctx.editMessageText('⭐️'.repeat(rating));
    
    // Update the keyboard
    await ctx.editMessageReplyMarkup({
        inline_keyboard: [[
            Markup.button.callback(`1 ${rating == 1 ? '✅' : '😣'}`, 'product_rating_1'),
            Markup.button.callback(`2 ${rating == 2 ? '✅' : '☹️'}`, 'product_rating_2'),
            Markup.button.callback(`3 ${rating == 3 ? '✅' : '😕'}`, 'product_rating_3'),
            Markup.button.callback(`4 ${rating == 4 ? '✅' : '😑'}`, 'product_rating_4'),
            Markup.button.callback(`5 ${rating == 5 ? '✅' : '😍'}`, 'product_rating_5'),
        ]]
    });
    
    // Check if all ratings are complete
    checkAllRatingsComplete(ctx);
});

// Handle service rating
reviewScene.action(/service_rating_(\d)/, async (ctx) => {
    const rating = parseInt(ctx.match[1] || '0');
    if (ctx.session.ratings) {
        ctx.session.ratings.service = rating;
    }
    
    // Acknowledge the selection
    await ctx.answerCbQuery(ctx.i18n.t('review.rating_received'));
    
    // We won't update the message text with stars
    // await ctx.editMessageText('⭐️'.repeat(rating));
    
    // Update the keyboard
    await ctx.editMessageReplyMarkup({
        inline_keyboard: [[
            Markup.button.callback(`1 ${rating == 1 ? '✅' : '👊🏻'}`, 'service_rating_1'),
            Markup.button.callback(`2 ${rating == 2 ? '✅' : '👎🏻'}`, 'service_rating_2'),
            Markup.button.callback(`3 ${rating == 3 ? '✅' : '👌🏻'}`, 'service_rating_3'),
            Markup.button.callback(`4 ${rating == 4 ? '✅' : '🤙🏻'}`, 'service_rating_4'),
            Markup.button.callback(`5 ${rating == 5 ? '✅' : '👍🏻'}`, 'service_rating_5'),
        ]]
    });
    
    // Check if all ratings are complete
    checkAllRatingsComplete(ctx);
});

// Handle delivery rating
reviewScene.action(/delivery_rating_(\d)/, async (ctx) => {
    const rating = parseInt(ctx.match[1] || '0');
    if (ctx.session.ratings) {
        ctx.session.ratings.delivery = rating;
    }
    
    // Acknowledge the selection
    await ctx.answerCbQuery(ctx.i18n.t('review.rating_received'));
    
    // We won't update the message text with stars
    // await ctx.editMessageText('⭐️'.repeat(rating));
    
    // Update the keyboard
    await ctx.editMessageReplyMarkup({
        inline_keyboard: [[
            Markup.button.callback(`1 ${rating == 1 ? '✅' : '🐌'}`, 'delivery_rating_1'),
            Markup.button.callback(`2 ${rating == 2 ? '✅' : '🐢'}`, 'delivery_rating_2'),
            Markup.button.callback(`3 ${rating == 3 ? '✅' : '🛺'}`, 'delivery_rating_3'),
            Markup.button.callback(`4 ${rating == 4 ? '✅' : '🏎-'}`, 'delivery_rating_4'),
            Markup.button.callback(`5 ${rating == 5 ? '✅' : '🚀'}`, 'delivery_rating_5'),
        ]]
    });
    
    // Check if all ratings are complete
    checkAllRatingsComplete(ctx);
});

// Handle confirm button action
reviewScene.action('confirm_review', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(ctx.i18n.t('review.review_completed'));
    
    // Return to feedback scene
    await ctx.scene.enter('feedback');
});

// Helper function to check if all ratings are complete and show confirm button
async function checkAllRatingsComplete(ctx: MyContext) {
    if (!ctx.session.ratings) return;
    
    const { product, service, delivery } = ctx.session.ratings;
    
    // If all ratings have been provided (non-zero values)
    if (product > 0 && service > 0 && delivery > 0) {
        // Show just the confirm and back buttons without explanation text
        await ctx.reply(
            ctx.i18n.t('review.can_confirm'),
            Markup.keyboard([
                [ctx.i18n.t('review.confirm'), ctx.i18n.t('menu.back')]
            ]).resize()
        );
    }
}

// Handle confirm button press
reviewScene.hears(match('review.confirm'), async (ctx) => {
    await ctx.reply(ctx.i18n.t('review.review_completed'));
    await ctx.scene.enter('feedback');
});

// Handle back command
reviewScene.hears(match('menu.back'), async (ctx) => {
    await ctx.scene.enter('feedback');
});

// Handle unexpected messages
reviewScene.on('message', async (ctx) => {
    // Check if message has text
    if ('text' in ctx.message) {
        // Only respond if we're not expecting a confirm or back message
        const text = ctx.message.text;
        const confirmText = ctx.i18n.t('review.confirm');
        const backText = ctx.i18n.t('menu.back');
        
        if (text !== confirmText && text !== backText) {
            await ctx.reply(ctx.i18n.t('review.please_use_buttons'));
        }
    } else {
        // For non-text messages
        await ctx.reply(ctx.i18n.t('review.please_use_buttons'));
    }
}); 