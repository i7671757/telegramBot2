import { Scenes, Markup } from 'telegraf';
import type { MyContext } from '../config/context';
import { fetchTerminals, getTerminalById, getTerminalName, getTerminalDesc, getTerminalAddress, type Terminal } from '../utils/cities';

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

    // Fetch branches from API using the utility function
    const allTerminals = await fetchTerminals();
    
    console.log(`Total terminals fetched: ${allTerminals.length}`);
    
    // Filter terminals matching the selected city
    const terminals = allTerminals.filter((terminal: Terminal) => {
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
      const branchName = getTerminalName(terminal, language);
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
    getTerminalName(terminal, language) === text
  );

  if (selectedTerminal) {
    // Format branch information
    const branchName = getTerminalName(selectedTerminal, language);
    const branchDesc = getTerminalDesc(selectedTerminal, language);

    // Save only the selected branch ID and clear the terminals list
    ctx.session.selectedBranch = selectedTerminal.id;
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