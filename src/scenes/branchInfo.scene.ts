import { Scenes, Markup } from 'telegraf';
import type { MyContext } from '../config/context';

interface Terminal {
  id: number;
  name: string;
  name_uz: string;
  name_en: string;
  desc: string;
  desc_uz: string;
  desc_en: string;
  active: boolean;
  city_id: number;
  address: string;
  address_uz: string;
  address_en: string;
  phone: string;
  location: string;
  latitude: string;
  longitude: string;
}

// Helper function to get branch name based on language
const getBranchName = (terminal: Terminal, language: string): string => {
  switch (language) {
    case 'uz':
      return terminal.name_uz || terminal.name;
    case 'en':
      return terminal.name_en || terminal.name;
    default:
      return terminal.name;
  }
};

// Helper function to get branch address based on language
const getBranchAddress = (terminal: Terminal, language: string): string => {
  switch (language) {
    case 'uz':
      return terminal.address_uz || terminal.address;
    case 'en':
      return terminal.address_en || terminal.address;
    default:
      return terminal.address;
  }
};

// Helper function to get branch description based on language
const getBranchDesc = (terminal: Terminal, language: string): string => {
  switch (language) {
    case 'uz':
      return terminal.desc_uz || terminal.desc;
    case 'en':
      return terminal.desc_en || terminal.desc;
    default:
      return terminal.desc;
  }
};

// Create branch info scene
export const branchInfoScene = new Scenes.BaseScene<MyContext>('branchInfo');

branchInfoScene.command('start', async (ctx) => {
 // Leave the current scene to return to the global context
 await ctx.scene.leave();
  
 // Now pass control to the global /start command handler
 // This will trigger the global handler which resets the session
 await ctx.reply(ctx.i18n.t('bot_restarted') || 'Bot has been restarted. Starting from the beginning...');
 
 // Go to language selection scene (now called start scene)
 return ctx.scene.enter('start');
});

// Добавляем обработчик команды /settings
branchInfoScene.command('settings', async (ctx) => {
  console.log('BranchInfo scene: /settings command received');
  
  // Выходим из текущей сцены
  await ctx.scene.leave();
  
  // Переходим в сцену настроек
  return ctx.scene.enter('settings');
});

branchInfoScene.command('order', async (ctx) => {
  await ctx.scene.enter('newOrder');
});

branchInfoScene.command('feedback', async (ctx) => {
  await ctx.scene.enter('callback');
});

// branchInfoScene.command('categories', async (ctx) => {
//   await ctx.scene.enter('categories');
// });
  
branchInfoScene.enter(async (ctx) => {
  try {
    // Check if city is selected
    if (!ctx.session?.currentCity) {
      await ctx.reply(ctx.i18n.t('changeCity.select_city'));
      return ctx.scene.enter('changeCity');
    }

    console.log(`Selected city ID: ${ctx.session.currentCity}`);

    // Fetch branches from API
    const response = await fetch('https://api.lesailes.uz/api/terminals');
    const data = await response.json() as { data: Terminal[] };
    
    console.log(`Total terminals fetched: ${data.data.length}`);
    console.log(`Active terminals: ${data.data.filter(t => t.active).length}`);
    
    // Filter active terminals and those matching the selected city
    const terminals = data.data.filter((terminal: Terminal) => {
      const matches = terminal.active && terminal.city_id.toString() === ctx.session?.currentCity;
      if (terminal.active) {
        console.log(`Terminal: ${terminal.name}, city_id: ${terminal.city_id}, currentCity: ${ctx.session.currentCity}, matches: ${matches}`);
      }
      return matches;
    });

    console.log(`Filtered terminals count: ${terminals.length}`);

    if (terminals.length === 0) {
      await ctx.reply(ctx.i18n.t('branchInfo.no_branches'));
      return ctx.scene.enter('mainMenu');
    }

    // Get current language
    const language = ctx.i18n.locale();

    // Create keyboard with branches in a grid (2 columns)
    const buttons: string[][] = [];
    let row: string[] = [];

    for (const terminal of terminals) {
      const branchName = getBranchName(terminal, language);
      row.push(branchName);

      if (row.length === 2) {
        buttons.push([...row]);
        row = [];
      }
    }

    // Add remaining branch if any
    if (row.length > 0) {
      buttons.push([...row]);
    }

    // Add back button
    buttons.push([ctx.i18n.t('menu.back')]);

    const keyboard = Markup.keyboard(buttons).resize();
    
    // Save terminals in session for branch selection
    // We'll remove this from the session after a branch is selected
    ctx.session.terminals = terminals;

    await ctx.reply(ctx.i18n.t('branchInfo.select_branch'), keyboard);
  } catch (error) {
    console.error('Error fetching branches:', error);
    await ctx.reply(ctx.i18n.t('error_occurred'));
    return ctx.scene.enter('mainMenu');
  }
});

// Handle branch selection
branchInfoScene.on('text', async (ctx) => {
  const text = ctx.message.text;

  // Handle back button
  if (text === ctx.i18n.t('menu.back')) {
    return ctx.scene.enter('mainMenu');
  }

  // Get terminals from session
  const terminals = ctx.session?.terminals || [];
  const language = ctx.i18n.locale();

  // Find selected terminal
  const selectedTerminal = terminals.find(terminal => 
    getBranchName(terminal, language) === text
  );

  if (selectedTerminal) {
    // Format branch information
    const branchName = getBranchName(selectedTerminal, language);
    const branchDesc = getBranchDesc(selectedTerminal, language);

    // Save only the selected branch and clear the terminals list
    ctx.session.selectedBranch = selectedTerminal;
    ctx.session.terminals = undefined;

    // Send branch name and description
    await ctx.reply(ctx.i18n.t('branchInfo.branch_details', {
      name: branchName,
      desc: branchDesc
    }));

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

    // Return to branch list
    await ctx.scene.reenter();
  }
}); 