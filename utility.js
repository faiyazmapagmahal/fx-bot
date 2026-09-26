const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, version: djsVersion } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');
const storage = require('./storage');
const { getSnipe, getEditSnipe, clearSnipe } = require('./snipeCache');

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('afk')
      .setDescription('Mark yourself as AFK')
      .addStringOption((o) => o.setName('reason').setDescription('Why are you AFK?')),
    async execute(interaction) {
      const reason = interaction.options.getString('reason') || 'AFK';
      storage.setAfk(interaction.guild.id, interaction.user.id, reason);

      const member = interaction.member;
      if (member?.manageable && !member.nickname?.startsWith('[AFK] ')) {
        const base = member.nickname || member.user.username;
        member.setNickname(`[AFK] ${base}`.slice(0, 32)).catch(() => null);
      }
      await interaction.reply(`💤 You're now AFK: ${reason}`);
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('avatar')
      .setDescription("Show a user's avatar")
      .addUserOption((o) => o.setName('user').setDescription('User to check')),
    async execute(interaction) {
      const user = interaction.options.getUser('user') || interaction.user;
      const embed = new EmbedBuilder()
        .setTitle(`${user.tag}'s avatar`)
        .setImage(user.displayAvatarURL({ size: 1024 }))
        .setColor(0x5865f2);
      await interaction.reply({ embeds: [embed] });
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('userinfo')
      .setDescription('Show information about a user')
      .addUserOption((o) => o.setName('user').setDescription('User to check')),
    async execute(interaction) {
      const user = interaction.options.getUser('user') || interaction.user;
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);

      const embed = new EmbedBuilder()
        .setTitle(user.tag)
        .setThumbnail(user.displayAvatarURL())
        .setColor(0x5865f2)
        .addFields(
          { name: 'User ID', value: user.id, inline: true },
          { name: 'Account created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true }
        );

      if (member) {
        embed.addFields(
          { name: 'Joined server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
          {
            name: `Roles (${member.roles.cache.size - 1})`,
            value: member.roles.cache.filter((r) => r.id !== interaction.guild.id).map((r) => r).join(' ') || 'None'
          }
        );
      }
      await interaction.reply({ embeds: [embed] });
    }
  },
  {
    data: new SlashCommandBuilder().setName('serverinfo').setDescription('Show information about this server'),
    async execute(interaction) {
      const guild = interaction.guild;
      const owner = await guild.fetchOwner();
      const embed = new EmbedBuilder()
        .setTitle(guild.name)
        .setThumbnail(guild.iconURL())
        .setColor(0x5865f2)
        .addFields(
          { name: 'Owner', value: owner.user.tag, inline: true },
          { name: 'Members', value: `${guild.memberCount}`, inline: true },
          { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
          { name: 'Roles', value: `${guild.roles.cache.size}`, inline: true },
          { name: 'Channels', value: `${guild.channels.cache.size}`, inline: true },
          { name: 'Boost level', value: `${guild.premiumTier}`, inline: true }
        );
      await interaction.reply({ embeds: [embed] });
    }
  },
  {
    data: new SlashCommandBuilder().setName('snipe').setDescription('Show the last deleted message in this channel'),
    async execute(interaction) {
      const snipe = getSnipe(interaction.channel.id);
      if (!snipe) return interaction.reply({ content: 'Nothing to snipe here.', ephemeral: true });
      const embed = new EmbedBuilder()
        .setAuthor({ name: snipe.authorTag, iconURL: snipe.authorAvatar || undefined })
        .setDescription(snipe.content)
        .setColor(0xed4245)
        .setTimestamp(snipe.timestamp);
      if (snipe.attachmentUrl) embed.setImage(snipe.attachmentUrl);
      await interaction.reply({ embeds: [embed] });
    }
  },
  {
    data: new SlashCommandBuilder().setName('editsnipe').setDescription('Show the last edited message in this channel'),
    async execute(interaction) {
      const snipe = getEditSnipe(interaction.channel.id);
      if (!snipe) return interaction.reply({ content: 'Nothing to editsnipe here.', ephemeral: true });
      const embed = new EmbedBuilder()
        .setAuthor({ name: snipe.authorTag, iconURL: snipe.authorAvatar || undefined })
        .addFields({ name: 'Before', value: snipe.before.slice(0, 1024) }, { name: 'After', value: snipe.after.slice(0, 1024) })
        .setColor(0xfee75c)
        .setTimestamp(snipe.timestamp);
      await interaction.reply({ embeds: [embed] });
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('clearsnipe')
      .setDescription('Clear the snipe cache for this channel')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async execute(interaction) {
      clearSnipe(interaction.channel.id);
      await interaction.reply({ content: '🧹 Snipe cache cleared for this channel.', ephemeral: true });
    }
  },
  {
    data: new SlashCommandBuilder().setName('stats').setDescription('Show bot statistics'),
    async execute(interaction) {
      const client = interaction.client;
      const uptimeSec = Math.floor(client.uptime / 1000);
      const h = Math.floor(uptimeSec / 3600);
      const m = Math.floor((uptimeSec % 3600) / 60);
      const s = uptimeSec % 60;
      const embed = new EmbedBuilder()
        .setTitle('Bot Statistics')
        .setColor(0x5865f2)
        .addFields(
          { name: 'Servers', value: `${client.guilds.cache.size}`, inline: true },
          { name: 'Uptime', value: `${h}h ${m}m ${s}s`, inline: true },
          { name: 'Ping', value: `${client.ws.ping}ms`, inline: true },
          { name: 'discord.js', value: djsVersion, inline: true },
          { name: 'Node.js', value: process.version, inline: true },
          { name: 'Memory', value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB`, inline: true }
        );
      await interaction.reply({ embeds: [embed] });
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('autorole')
      .setDescription('Configure the role automatically given to new members')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addSubcommand((sub) =>
        sub
          .setName('set')
          .setDescription('Set the autorole')
          .addRoleOption((o) => o.setName('role').setDescription('Role to auto-assign').setRequired(true))
      )
      .addSubcommand((sub) => sub.setName('remove').setDescription('Disable autorole'))
      .addSubcommand((sub) => sub.setName('status').setDescription('Show the current autorole')),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      if (sub === 'set') {
        const role = interaction.options.getRole('role');
        storage.setAutoRole(interaction.guild.id, role.id);
        return interaction.reply(`✅ New members will automatically receive ${role}.`);
      }
      if (sub === 'remove') {
        storage.setAutoRole(interaction.guild.id, null);
        return interaction.reply('✅ Autorole disabled.');
      }
      if (sub === 'status') {
        const roleId = storage.getAutoRole(interaction.guild.id);
        return interaction.reply({
          content: roleId ? `Current autorole: <@&${roleId}>` : 'No autorole set.',
          ephemeral: true
        });
      }
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('joinvc')
      .setDescription('Make the bot join a voice channel')
      .addChannelOption((o) => o.setName('channel').setDescription('Voice channel to join').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers),
    async execute(interaction) {
      const channel = interaction.options.getChannel('channel');
      if (!channel.isVoiceBased()) {
        return interaction.reply({ content: 'That has to be a voice channel.', ephemeral: true });
      }
      joinVoiceChannel({
        channelId: channel.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator
      });
      await interaction.reply(`🔊 Joined ${channel}.`);
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('leavevc')
      .setDescription('Make the bot leave its current voice channel')
      .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers),
    async execute(interaction) {
      const connection = getVoiceConnection(interaction.guild.id);
      if (!connection) return interaction.reply({ content: "I'm not in a voice channel.", ephemeral: true });
      connection.destroy();
      await interaction.reply('👋 Left the voice channel.');
    }
  }
];
