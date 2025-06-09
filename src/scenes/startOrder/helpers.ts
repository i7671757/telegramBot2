import { Markup } from "telegraf";
import type { AuthContext } from "../../middlewares/auth";
import { fetchTerminals, getTerminalName } from "../../utils/cities";

export const selectPickupBranch = async (ctx: AuthContext) => {
    try {
        // Check if city is selected
        if (!ctx.session?.currentCity) {
            await ctx.reply(ctx.i18n.t('changeCity.select_city'));
            return ctx.scene.enter('changeCity');
        }

        (ctx.session as any).step = 'pickup.chooseBranch';

        console.log(`Selected city ID: ${ctx.session.currentCity}`);

        // Fetch branches from API using the utility function
        const allTerminals = await fetchTerminals();
        
        console.log(`Total terminals fetched: ${allTerminals.length}`);
        
        // Filter terminals matching the selected city
        const terminals = allTerminals.filter((terminal) => {
            const matches = terminal.active && terminal.city_id.toString() === ctx.session?.currentCity;
            if (terminal.active) {
                console.log(`Terminal: ${terminal.name}, city_id: ${terminal.city_id}, currentCity: ${ctx.session.currentCity}, matches: ${matches}`);
            }
            return matches;
        });

        console.log(`Filtered terminals count: ${terminals.length}`);

        if (terminals.length === 0) {
            await ctx.reply(ctx.i18n.t('branchInfo.no_branches'));
            return ctx.scene.reenter();
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

        // Add back button
        buttons.push([ctx.i18n.t('startOrder.back')]);

        const keyboard = Markup.keyboard(buttons).resize();
        
        // Save terminals in session for branch selection
        // We'll remove this from the session after a branch is selected
        ctx.session.terminals = terminals;

        await ctx.reply(ctx.i18n.t('branchInfo.select_branch'), keyboard);
    } catch (error) {
        console.error('Error fetching branches:', error);
        await ctx.reply(ctx.i18n.t('error_occurred'));
        return ctx.scene.reenter();
    }
}

export const selectPickup = async (ctx: AuthContext) => {
    // Save delivery type in session
    (ctx.session as any).deliveryType = 'pickup';
    (ctx.session as any).step = 'pickup';
    console.log('User selected pickup delivery type');
    
    const keyboard = Markup.keyboard([
        [ctx.i18n.t('startOrder.pickup.back'), Markup.button.locationRequest(ctx.i18n.t('startOrder.pickup.getLocation'))],
        [ctx.i18n.t('startOrder.pickup.orderHere'), ctx.i18n.t('startOrder.pickup.selectBranch')]
    ]).resize();

    await ctx.reply(
        ctx.i18n.t('startOrder.pickup.text'),
        { 
            parse_mode: "HTML",
            ...keyboard
        }
    );
}