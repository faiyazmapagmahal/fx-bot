require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const { registerAntiNukeListeners } = require('./antiNuke');
const { registerSnipeListeners } = require('./snipeCache');
const { registerAfkListener } = require('./afk');
const { registerAutoRoleListener } = require('./autorole');
const { registerAutomodListener } = require('./automod');
const { registerAntiRaidListener } = require('./antiraid');
const { registerWelcomeListener } = require('./welcome');
const { startSocialWatchPolling } = require('./socialWatch');
const { registerLoggingListeners } = require('./logging');

const moderationCommands = require('./moderation');
const antinukeCommands = require('./antinuke');
const utilityCommands = require('./utility');
const automodCommands = require('./automod-cmd');
const socialsCommands = require('./socials');
const welcomeCommands = require('./welcome-cmd');
const logsCommands = require('./logs');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration, // ban add/remove events
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildVoiceStates // needed for joinvc/leavevc
  ],
  partials: [Partials.GuildMember, Partials.User, Partials.Message, Partials.Channel]
});

const allCommands = [
  ...moderationCommands,
  ...antinukeCommands,
  ...utilityCommands,
  ...automodCommands,
  ...socialsCommands,
  ...welcomeCommands,
  ...logsCommands
];

client.commands = new Collection();
allCommands.forEach((cmd) => {
  client.commands.set(cmd.data.name, cmd);
});

client.once('clientReady', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`🛡️ Anti-nuke active across ${client.guilds.cache.size} server(s).`);
  startSocialWatchPolling(client);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Error executing /${interaction.commandName}:`, err);
    const payload = { content: `❌ Something went wrong: ${err.message}`, ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload).catch(() => null);
    } else {
      await interaction.reply(payload).catch(() => null);
    }
  }
});

registerAntiNukeListeners(client);
registerSnipeListeners(client);
registerAfkListener(client);
registerAutoRoleListener(client);
registerAutomodListener(client);
registerAntiRaidListener(client);
registerWelcomeListener(client);
registerLoggingListeners(client);

client.login(process.env.DISCORD_TOKEN);
