const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const storage = require('./storage');
const { logModAction } = require('./logging');

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('ban')
      .setDescription('Ban a member from the server')
      .addUserOption((o) => o.setName('user').setDescription('User to ban').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Reason for the ban'))
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    async execute(interaction) {
      const user = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (member && !member.bannable) {
        return interaction.reply({ content: `I can't ban ${user.tag} — check role hierarchy.`, ephemeral: true });
      }
      await interaction.guild.members.ban(user.id, { reason });
      await logModAction(interaction.guild, { action: 'Ban', target: user.tag, moderator: interaction.user.tag, reason });
      await interaction.reply(`🔨 Banned **${user.tag}** — ${reason}`);
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('unban')
      .setDescription('Unban a user by ID')
      .addStringOption((o) => o.setName('userid').setDescription('User ID to unban').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    async execute(interaction) {
      const userId = interaction.options.getString('userid');
      await interaction.guild.members.unban(userId).catch((err) => {
        throw new Error(`Could not unban that ID: ${err.message}`);
      });
      await logModAction(interaction.guild, { action: 'Unban', target: userId, moderator: interaction.user.tag, reason: 'N/A' });
      await interaction.reply(`✅ Unbanned user ID \`${userId}\``);
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('kick')
      .setDescription('Kick a member from the server')
      .addUserOption((o) => o.setName('user').setDescription('User to kick').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Reason for the kick'))
      .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    async execute(interaction) {
      const user = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
      if (!member.kickable) {
        return interaction.reply({ content: `I can't kick ${user.tag} — check role hierarchy.`, ephemeral: true });
      }
      await member.kick(reason);
      await logModAction(interaction.guild, { action: 'Kick', target: user.tag, moderator: interaction.user.tag, reason });
      await interaction.reply(`👢 Kicked **${user.tag}** — ${reason}`);
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('timeout')
      .setDescription('Timeout (mute) a member')
      .addUserOption((o) => o.setName('user').setDescription('User to timeout').setRequired(true))
      .addIntegerOption((o) => o.setName('minutes').setDescription('Duration in minutes').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Reason for the timeout'))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
      const user = interaction.options.getUser('user');
      const minutes = interaction.options.getInteger('minutes');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
      await member.timeout(minutes * 60 * 1000, reason);
      await logModAction(interaction.guild, {
        action: 'Timeout',
        target: user.tag,
        moderator: interaction.user.tag,
        reason: `${reason} (${minutes}m)`
      });
      await interaction.reply(`🔇 Timed out **${user.tag}** for ${minutes} minute(s) — ${reason}`);
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('untimeout')
      .setDescription('Remove a timeout from a member')
      .addUserOption((o) => o.setName('user').setDescription('User to un-timeout').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
      const user = interaction.options.getUser('user');
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
      await member.timeout(null);
      await logModAction(interaction.guild, {
        action: 'Untimeout',
        target: user.tag,
        moderator: interaction.user.tag,
        reason: 'N/A'
      });
      await interaction.reply(`🔊 Removed timeout from **${user.tag}**`);
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('warn')
      .setDescription('Issue a warning to a member')
      .addUserOption((o) => o.setName('user').setDescription('User to warn').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Reason for the warning').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
      const user = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason');
      const warnings = storage.addWarning(interaction.guild.id, user.id, reason, interaction.user.id);
      await logModAction(interaction.guild, { action: 'Warn', target: user.tag, moderator: interaction.user.tag, reason });
      await interaction.reply(`⚠️ Warned **${user.tag}** — ${reason}\nTotal warnings: ${warnings.length}`);
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('warnings')
      .setDescription("List a member's warnings")
      .addUserOption((o) => o.setName('user').setDescription('User to check').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
      const user = interaction.options.getUser('user');
      const warnings = storage.getWarnings(interaction.guild.id, user.id);
      if (warnings.length === 0) {
        return interaction.reply({ content: `${user.tag} has no warnings.`, ephemeral: true });
      }
      const list = warnings
        .map((w, i) => `${i + 1}. ${w.reason} — <@${w.moderatorId}> (<t:${Math.floor(w.timestamp / 1000)}:R>)`)
        .join('\n');
      await interaction.reply({ content: `**Warnings for ${user.tag}:**\n${list}`, ephemeral: true });
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('clearwarnings')
      .setDescription("Clear a member's warnings")
      .addUserOption((o) => o.setName('user').setDescription('User to clear').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
      const user = interaction.options.getUser('user');
      storage.clearWarnings(interaction.guild.id, user.id);
      await interaction.reply(`✅ Cleared warnings for **${user.tag}**`);
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('purge')
      .setDescription('Bulk delete recent messages in this channel')
      .addIntegerOption((o) =>
        o.setName('count').setDescription('Number of messages to delete (1-100)').setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async execute(interaction) {
      const count = interaction.options.getInteger('count');
      if (count < 1 || count > 100) {
        return interaction.reply({ content: 'Count must be between 1 and 100.', ephemeral: true });
      }
      const deleted = await interaction.channel.bulkDelete(count, true);
      await interaction.reply({ content: `🧹 Deleted ${deleted.size} message(s).`, ephemeral: true });
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('lock')
      .setDescription('Lock this channel (prevent @everyone from sending messages)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    async execute(interaction) {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: false
      });
      await interaction.reply('🔒 Channel locked.');
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('unlock')
      .setDescription('Unlock this channel')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    async execute(interaction) {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: null
      });
      await interaction.reply('🔓 Channel unlocked.');
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('slowmode')
      .setDescription('Set slowmode for this channel')
      .addIntegerOption((o) =>
        o.setName('seconds').setDescription('Seconds between messages (0 to disable)').setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    async execute(interaction) {
      const seconds = interaction.options.getInteger('seconds');
      await interaction.channel.setRateLimitPerUser(seconds);
      await interaction.reply(
        seconds === 0 ? '⏱️ Slowmode disabled.' : `⏱️ Slowmode set to ${seconds} second(s).`
      );
    }
  }
];
