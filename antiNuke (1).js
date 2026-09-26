const { AuditLogEvent, PermissionsBitField } = require('discord.js');
const storage = require('./storage');

// In-memory sliding-window action tracker: `${guildId}:${executorId}:${type}` -> timestamps[]
const actionLog = new Map();

const DANGEROUS_PERMS = [
  PermissionsBitField.Flags.Administrator,
  PermissionsBitField.Flags.BanMembers,
  PermissionsBitField.Flags.KickMembers,
  PermissionsBitField.Flags.ManageGuild,
  PermissionsBitField.Flags.ManageRoles,
  PermissionsBitField.Flags.ManageChannels,
  PermissionsBitField.Flags.ManageWebhooks
];

function recordAction(guildId, executorId, type) {
  const key = `${guildId}:${executorId}:${type}`;
  const now = Date.now();
  const arr = actionLog.get(key) || [];
  arr.push(now);
  actionLog.set(key, arr);
  return arr;
}

function countWithinWindow(arr, windowSeconds) {
  const cutoff = Date.now() - windowSeconds * 1000;
  return arr.filter((t) => t >= cutoff).length;
}

async function getRecentExecutor(guild, auditLogType, targetId = null) {
  try {
    const logs = await guild.fetchAuditLogs({ type: auditLogType, limit: 5 });
    const entry = logs.entries.find((e) => {
      const recent = Date.now() - e.createdTimestamp < 10000; // last 10s
      const matchesTarget = targetId ? e.target?.id === targetId : true;
      return recent && matchesTarget;
    });
    return entry ? entry.executor : null;
  } catch (err) {
    console.error('Audit log fetch failed:', err.message);
    return null;
  }
}

async function punish(guild, executor, reason, logChannelId, punishmentType) {
  try {
    const member = await guild.members.fetch(executor.id).catch(() => null);
    if (!member) return;
    if (!member.manageable) {
      console.warn(`Cannot punish ${executor.tag}: role hierarchy too high.`);
      await notify(guild, logChannelId,
        `⚠️ Detected **${reason}** by ${executor.tag} but could not act — their role is above mine or they're the owner.`);
      return;
    }

    // Strip roles first regardless of punishment type, to immediately neutralize permissions
    await member.roles.set([]).catch(() => null);

    if (punishmentType === 'ban') {
      await guild.members.ban(executor.id, { reason: `Anti-nuke: ${reason}` });
    } else if (punishmentType === 'kick') {
      await member.kick(`Anti-nuke: ${reason}`);
    }
    // 'strip_roles' punishment type just leaves them role-less

    await notify(guild, logChannelId,
      `🛡️ **Anti-nuke triggered**\nUser: ${executor.tag} (${executor.id})\nReason: ${reason}\nAction taken: ${punishmentType}`);
  } catch (err) {
    console.error('Failed to punish executor:', err);
  }
}

async function notify(guild, logChannelId, message) {
  if (!logChannelId) return;
  const channel = guild.channels.cache.get(logChannelId);
  if (channel?.isTextBased()) {
    channel.send(message).catch(() => null);
  }
}

async function handleTrigger(guild, executor, type, reasonLabel) {
  if (!executor || executor.bot === false && executor.id === guild.ownerId) return;
  if (executor.id === guild.client.user.id) return; // never punish self

  const data = storage.getGuildData(guild.id);
  if (!data.antiNuke.enabled) return;

  const member = await guild.members.fetch(executor.id).catch(() => null);
  if (member && storage.isWhitelisted(guild.id, member)) return;
  if (executor.id === guild.ownerId) return;

  const threshold = data.antiNuke.thresholds[type];
  if (!threshold) return;

  const arr = recordAction(guild.id, executor.id, type);
  const count = countWithinWindow(arr, threshold.windowSeconds);

  if (count >= threshold.limit) {
    actionLog.delete(`${guild.id}:${executor.id}:${type}`); // reset after triggering
    await punish(guild, executor, reasonLabel, data.antiNuke.logChannelId, data.antiNuke.punishment);
  }
}

function registerAntiNukeListeners(client) {
  client.on('channelDelete', async (channel) => {
    if (!channel.guild) return;
    const executor = await getRecentExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
    await handleTrigger(channel.guild, executor, 'channelDelete', 'Mass channel deletion');
  });

  client.on('channelCreate', async (channel) => {
    if (!channel.guild) return;
    const executor = await getRecentExecutor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
    await handleTrigger(channel.guild, executor, 'channelCreate', 'Mass channel creation');
  });

  client.on('roleDelete', async (role) => {
    const executor = await getRecentExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);
    await handleTrigger(role.guild, executor, 'roleDelete', 'Mass role deletion');
  });

  client.on('roleCreate', async (role) => {
    const executor = await getRecentExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);
    await handleTrigger(role.guild, executor, 'roleCreate', 'Mass role creation');
  });

  client.on('guildBanAdd', async (ban) => {
    const executor = await getRecentExecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
    await handleTrigger(ban.guild, executor, 'memberBan', 'Mass member banning');
  });

  client.on('guildMemberRemove', async (member) => {
    // Distinguish kicks from voluntary leaves via audit log
    const executor = await getRecentExecutor(member.guild, AuditLogEvent.MemberKick, member.id);
    if (executor) {
      await handleTrigger(member.guild, executor, 'memberKick', 'Mass member kicking');
    }
  });

  client.on('webhooksUpdate', async (channel) => {
    const executor = await getRecentExecutor(channel.guild, AuditLogEvent.WebhookCreate);
    await handleTrigger(channel.guild, executor, 'webhookCreate', 'Suspicious webhook creation');
  });

  client.on('guildMemberAdd', async (member) => {
    if (!member.user.bot) return;
    const executor = await getRecentExecutor(member.guild, AuditLogEvent.BotAdd, member.id);
    await handleTrigger(member.guild, executor, 'botAdd', 'Unauthorized bot addition');
  });

  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    const gainedDangerousRole = newMember.roles.cache.some((role) => {
      if (oldMember.roles.cache.has(role.id)) return false;
      return role.permissions.any(DANGEROUS_PERMS);
    });
    if (!gainedDangerousRole) return;
    const executor = await getRecentExecutor(newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
    await handleTrigger(newMember.guild, executor, 'dangerousRoleGrant', 'Granting dangerous permissions');
  });
}

module.exports = { registerAntiNukeListeners };
