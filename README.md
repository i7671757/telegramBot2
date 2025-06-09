# Telegram Bot Project

This is a Telegram bot built using TypeScript and Telegraf framework, running in webhook mode with Elysia.js server.

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
- **Webhook mode** for better performance and scalability

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

1. Create a `.env` file with your configuration:
```env
# Bot Configuration
BOT_TOKEN=your_telegram_bot_token_here

# Webhook Configuration (required for webhook mode)
WEBHOOK_URL=https://yourdomain.com
WEBHOOK_PATH=/webhook
PORT=3000
HOST=0.0.0.0

# Session Configuration
SESSION_PATH=./sessions.json

# Environment
NODE_ENV=production

# API Configuration
API_URL=https://api.lesailes.uz/
```

2. Install dependencies:
```
bun install
```

3. Run the bot:
```bash
# Production mode
bun start

# Development mode with auto-reload
bun run dev

# Or directly
bun run index.ts
```

## Webhook Management

The project includes utility scripts for webhook management:

```bash
# Check current webhook status
bun run webhook:info

# Set webhook URL (uses WEBHOOK_URL from .env)
bun run webhook:set

# Delete webhook (switch back to polling mode)
bun run webhook:delete
```

## Webhook Mode

The bot now runs in **webhook mode** instead of long polling, which provides several advantages:

### Benefits:
- **Better Performance**: No need to constantly poll Telegram servers
- **Lower Resource Usage**: More efficient for production environments
- **Scalability**: Can handle multiple instances behind a load balancer
- **Real-time Updates**: Instant message processing

### Configuration:
- **WEBHOOK_URL**: Your public domain (e.g., `https://yourdomain.com`)
- **WEBHOOK_PATH**: Endpoint path for webhook (default: `/webhook`)
- **PORT**: Server port (default: `3000`)
- **HOST**: Server host (default: `0.0.0.0`)

### Deployment Requirements:
1. **HTTPS**: Telegram requires HTTPS for webhooks
2. **Public Domain**: Your server must be accessible from the internet
3. **Valid SSL Certificate**: Required for webhook functionality

### Local Development:
For local development, you can use tools like:
- **ngrok**: `ngrok http 3000` to create a public tunnel
- **localtunnel**: `npx localtunnel --port 3000`

Example with ngrok:
```bash
# Terminal 1: Start the bot
bun run index.ts

# Terminal 2: Create public tunnel
ngrok http 3000

# Update .env with the ngrok URL
WEBHOOK_URL=https://abc123.ngrok.io
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
