const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const storage = require('./storage');

function buildPlatformCommand(name, description, envKeyName) {
  return {
    data: new SlashCommandBuilder()
      .setName(name)
      .setDescription(description)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((sub) =>
        sub
          .setName('add')
          .setDescription(`Watch an account for new ${name} posts`)
          .addStringOption((o) => o.setName('account').setDescription('Username / handle').setRequired(true))
          .addChannelOption((o) =>
            o
              .setName('channel')
              .setDescription('Channel to post alerts to')
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(true)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName('remove')
          .setDescription(`Stop watching an account`)
          .addStringOption((o) => o.setName('account').setDescription('Username / handle').setRequired(true))
      )
      .addSubcommand((sub) => sub.setName('list').setDescription(`List watched ${name} accounts`)),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guild.id;

      if (sub === 'add') {
        const account = interaction.options.getString('account').replace(/^@/, '');
        const channel = interaction.options.getChannel('channel');

        if (!process.env[envKeyName]) {
          return interaction.reply({
            content:
              `⚠️ I'll save this watch, but **${envKeyName}** isn't set in the bot's environment yet, ` +
              `so nothing will actually post until you configure it. See the README for setup.`,
            ephemeral: true
          });
        }

        storage.addSocialWatch(guildId, name, { account, channelId: channel.id, lastId: null });
        return interaction.reply(`✅ Now watching **${account}** on ${name} — alerts go to ${channel}.`);
      }

      if (sub === 'remove') {
        const account = interaction.options.getString('account').replace(/^@/, '');
        storage.removeSocialWatch(guildId, name, account);
        return interaction.reply(`✅ Stopped watching **${account}** on ${name}.`);
      }

      if (sub === 'list') {
        const watches = storage.listSocialWatch(guildId, name);
        if (watches.length === 0) {
          return interaction.reply({ content: `No ${name} accounts are being watched.`, ephemeral: true });
        }
        const list = watches.map((w) => `• **${w.account}** → <#${w.channelId}>`).join('\n');
        return interaction.reply({ content: `**Watched ${name} accounts:**\n${list}`, ephemeral: true });
      }
    }
  };
}

module.exports = [
  buildPlatformCommand('youtube', 'Get notified about new YouTube uploads', 'YOUTUBE_API_KEY'),
  buildPlatformCommand('instagram', 'Get notified about new Instagram posts', 'INSTAGRAM_API_KEY'),
  buildPlatformCommand('tiktok', 'Get notified about new TikTok posts', 'TIKTOK_API_KEY')
];
