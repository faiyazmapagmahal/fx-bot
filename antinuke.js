const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const storage = require('./storage');

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('antinuke')
      .setDescription('Configure anti-nuke protection')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addSubcommand((sub) =>
        sub
          .setName('enable')
          .setDescription('Enable anti-nuke protection')
      )
      .addSubcommand((sub) =>
        sub
          .setName('disable')
          .setDescription('Disable anti-nuke protection')
      )
      .addSubcommand((sub) =>
        sub
          .setName('status')
          .setDescription('View current anti-nuke configuration')
      )
      .addSubcommand((sub) =>
        sub
          .setName('setlogchannel')
          .setDescription('Set the channel for anti-nuke alerts')
          .addChannelOption((o) =>
            o
              .setName('channel')
              .setDescription('Channel to send alerts to')
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(true)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName('setpunishment')
          .setDescription('Set the punishment applied to violators')
          .addStringOption((o) =>
            o
              .setName('type')
              .setDescription('Punishment type')
              .setRequired(true)
              .addChoices(
                { name: 'Ban', value: 'ban' },
                { name: 'Kick', value: 'kick' },
                { name: 'Strip roles only', value: 'strip_roles' }
              )
          )
      ),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guild.id;

      if (sub === 'enable') {
        storage.setAntiNukeEnabled(guildId, true);
        return interaction.reply('🛡️ Anti-nuke protection **enabled**.');
      }
      if (sub === 'disable') {
        storage.setAntiNukeEnabled(guildId, false);
        return interaction.reply('⚠️ Anti-nuke protection **disabled**. Your server is unprotected.');
      }
      if (sub === 'setlogchannel') {
        const channel = interaction.options.getChannel('channel');
        storage.setLogChannel(guildId, channel.id);
        return interaction.reply(`📋 Anti-nuke alerts will now be sent to ${channel}.`);
      }
      if (sub === 'setpunishment') {
        const type = interaction.options.getString('type');
        storage.setPunishment(guildId, type);
        return interaction.reply(`✅ Punishment set to **${type}**.`);
      }
      if (sub === 'status') {
        const data = storage.getGuildData(guildId);
        const t = data.antiNuke.thresholds;
        const thresholdLines = Object.entries(t)
          .map(([key, val]) => `• ${key}: ${val.limit} actions / ${val.windowSeconds}s`)
          .join('\n');
        return interaction.reply({
          content:
            `**Anti-Nuke Status**\n` +
            `Enabled: ${data.antiNuke.enabled ? 'Yes' : 'No'}\n` +
            `Punishment: ${data.antiNuke.punishment}\n` +
            `Log channel: ${data.antiNuke.logChannelId ? `<#${data.antiNuke.logChannelId}>` : 'Not set'}\n` +
            `Whitelisted users: ${data.whitelistedUserIds.length}\n\n` +
            `**Thresholds:**\n${thresholdLines}`,
          ephemeral: true
        });
      }
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('whitelist')
      .setDescription('Manage the anti-nuke trusted-user whitelist')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addSubcommand((sub) =>
        sub
          .setName('add')
          .setDescription('Add a trusted user to the whitelist')
          .addUserOption((o) => o.setName('user').setDescription('User to trust').setRequired(true))
      )
      .addSubcommand((sub) =>
        sub
          .setName('remove')
          .setDescription('Remove a user from the whitelist')
          .addUserOption((o) => o.setName('user').setDescription('User to remove').setRequired(true))
      )
      .addSubcommand((sub) => sub.setName('list').setDescription('List all whitelisted users')),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guild.id;

      if (sub === 'add') {
        const user = interaction.options.getUser('user');
        storage.addToWhitelist(guildId, user.id);
        return interaction.reply(`✅ **${user.tag}** is now trusted and exempt from anti-nuke actions.`);
      }
      if (sub === 'remove') {
        const user = interaction.options.getUser('user');
        storage.removeFromWhitelist(guildId, user.id);
        return interaction.reply(`✅ **${user.tag}** removed from the whitelist.`);
      }
      if (sub === 'list') {
        const data = storage.getGuildData(guildId);
        if (data.whitelistedUserIds.length === 0) {
          return interaction.reply({ content: 'No whitelisted users yet.', ephemeral: true });
        }
        const list = data.whitelistedUserIds.map((id) => `<@${id}>`).join('\n');
        return interaction.reply({ content: `**Whitelisted users:**\n${list}`, ephemeral: true });
      }
    }
  }
];
