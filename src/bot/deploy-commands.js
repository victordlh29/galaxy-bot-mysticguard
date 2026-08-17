const { REST, Routes, Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();
const { commandDefs } = require('./commands');

const VALID_COMMANDS = new Set(commandDefs.map((c) => c.name));

async function deploy() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const commands = commandDefs.map((c) => c.toJSON());

  try {
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    await client.login(process.env.DISCORD_TOKEN);
    const guilds = await client.guilds.fetch();

    for (const [guildId, guild] of guilds) {
      const guildCommands = await rest.get(Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId));
      const staleGuild = guildCommands.filter((c) => !VALID_COMMANDS.has(c.name));
      for (const c of staleGuild) {
        await rest.delete(Routes.applicationGuildCommand(process.env.CLIENT_ID, guildId, c.id));
        console.log(`[DEPLOY] Comando viejo eliminado (${guild.name}): /${c.name}`);
      }

      await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId), { body: commands });
      console.log(`[DEPLOY] ${commands.length} comandos registrados en ${guild.name} (${guildId})`);
    }
    client.destroy();

    const globalCommands = await rest.get(Routes.applicationCommands(process.env.CLIENT_ID));
    for (const c of globalCommands) {
      await rest.delete(Routes.applicationCommand(process.env.CLIENT_ID, c.id));
      console.log(`[DEPLOY] Comando global eliminado: /${c.name} (evita duplicados)`);
    }
    if (!globalCommands.length) console.log('[DEPLOY] Sin comandos globales.');
  } catch (err) {
    console.error('[DEPLOY] error:', err.message);
  }
}

if (require.main === module) deploy();

module.exports = { deploy };
