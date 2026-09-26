require('dotenv').config();
const { REST, Routes } = require('discord.js');
const moderationCommands = require('./moderation');
const antinukeCommands = require('./antinuke');
const utilityCommands = require('./utility');
const automodCommands = require('./automod-cmd');
const socialsCommands = require('./socials');
const welcomeCommands = require('./welcome-cmd');
const logsCommands = require('./logs');

const commands = [
  ...moderationCommands,
  ...antinukeCommands,
  ...utilityCommands,
  ...automodCommands,
  ...socialsCommands,
  ...welcomeCommands,
  ...logsCommands
].map((c) => c.data.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Deploying ${commands.length} slash commands...`);

    const route = process.env.GUILD_ID
      ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
      : Routes.applicationCommands(process.env.CLIENT_ID);

    await rest.put(route, { body: commands });

    console.log(
      process.env.GUILD_ID
        ? '✅ Commands deployed to guild instantly.'
        : '✅ Commands deployed globally (may take up to 1 hour to appear).'
    );
  } catch (err) {
    console.error('Failed to deploy commands:', err);
  }
})();
