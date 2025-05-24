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

## Session Optimization

The bot has been optimized to reduce session file size by storing only IDs instead of full objects:

### Changes Made:
- **selectedCity**: Now stores only the city ID (number) instead of the full city object
- **selectedBranch**: Now stores only the branch/terminal ID (number) instead of the full terminal object
- **Automatic Migration**: When the bot starts, it automatically converts existing sessions from full objects to IDs
- **API Integration**: City and terminal information is fetched from API when needed using the stored IDs
- **Temporary Data Cleanup**: Arrays like `cities` and `terminals` are removed after selection to save space

### Benefits:
- **Significantly Reduced File Size**: Session files are much smaller (from ~50KB+ to ~2KB per session)
- **Better Performance**: Faster session loading and saving
- **Memory Efficiency**: Less memory usage for session storage
- **Cleaner Data**: No redundant temporary data stored in sessions

### Maintenance Scripts:
- `cleanCitySessions.cjs` - Manual script to clean existing sessions from full city and branch objects
- `cleanSessions.js` - General session cleanup script

### Usage:
```bash
# Clean city and branch data from sessions manually
node cleanCitySessions.cjs

# General session cleanup
node cleanSessions.js
```

The bot automatically handles the migration when started, so no manual intervention is required for normal operation.
