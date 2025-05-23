# Telegram Bot Project

This is a Telegram bot built using TypeScript and Telegraf framework.

## Features

- Multi-language support (English, Russian, Uzbek)
- City selection based on user location
- Main menu with various options:
  - 🛍 Order placement
  - 📖 Order history
  - 💸 Cashback information
  - ☎️ Feedback
  - ⚙️ Settings and information
  - 🙋🏻‍♂️ Team recruitment
  - 🔥 Promotions
- User registration via phone number
- Profile management

## Project Structure

```
telegramBot2
  src/
    config/     - Configuration files
    locales/    - Language translations
    middlewares/ - Middleware functions
    scenes/     - Bot conversation scenes
    utils/      - Utility functions
  .env         - Environment variables
  index.ts     - Main bot file
  package.json - Dependencies and scripts
```

## Setup

1. Create a `.env` file with your Telegram bot token:
```
BOT_TOKEN=your_bot_token_here
```

2. Install dependencies:
```
bun install
```

3. Run the bot:
```
bun run index.ts
```

## Workflow

1. User starts the bot (/start)
2. User selects language
3. User registers by sharing contact
4. User selects city from available options
5. Main menu is displayed with all available actions
6. User can view their profile and change settings

## Available Commands

- /start - Start the bot
- /language - Change language
- /register - Register or update contact information
- /profile - View profile information
- /help - Show available commands
- /back - Return to the main menu
