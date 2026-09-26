const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const storage = require('./storage');

function color(hex) {
  return parseInt(hex.replace('#', ''), 16);
}

async function send(guild, channelId, embed) {
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;
  await channel.send({ embeds: [embed] }).catch(() => null);
}

// ---- Public helper so command files (moderation.js) can log actions ----
async function logModAction(guild, { action, target, moderator, reason }) {
  const logs = storage.getLogsConfig(guild.id);
  if (!logs.modLogId) return;
  const embed = new EmbedBuilder()
    .setColor(color('#e67e22'))
    .setTitle(`🛠️ Mod Action: ${action}`)
    .addFields(
      { name: 'Target', value: `${target}`, inline: true },
      { name: 'Moderator', value: `${moderator}`, inline: true },
      { name: 'Reason', value: reason || 'No reason provided' }
    )
    .setTimestamp();
  await send(guild, logs.modLogId, embed);
}

function registerLoggingListeners(client) {
  // ---- Channel log: create / delete / update ----
  client.on('channelCreate', async (channel) => {
    if (!channel.guild) return;
    const logs = storage.getLogsConfig(channel.guild.id);
    const embed = new EmbedBuilder()
      .setColor(color('#2ecc71'))
      .setTitle('📁 Channel Created')
      .setDescription(`${channel} (\`${channel.name}\`)`)
      .setTimestamp();
    await send(channel.guild, logs.channelLogId, embed);
  });

  client.on('channelDelete', async (channel) => {
    if (!channel.guild) return;
    const logs = storage.getLogsConfig(channel.guild.id);
    const embed = new EmbedBuilder()
      .setColor(color('#e74c3c'))
      .setTitle('📁 Channel Deleted')
      .setDescription(`\`#${channel.name}\``)
      .setTimestamp();
    await send(channel.guild, logs.channelLogId, embed);
  });

  client.on('channelUpdate', async (oldChannel, newChannel) => {
    if (!newChannel.guild) return;
    if (oldChannel.name === newChannel.name) return; // avoid noisy non-name updates
    const logs = storage.getLogsConfig(newChannel.guild.id);
    const embed = new EmbedBuilder()
      .setColor(color('#f1c40f'))
      .setTitle('📁 Channel Renamed')
      .setDescription(`\`${oldChannel.name}\` → ${newChannel}`)
      .setTimestamp();
    await send(newChannel.guild, logs.channelLogId, embed);
  });

  // ---- Guild log: server settings + roles ----
  client.on('guildUpdate', async (oldGuild, newGuild) => {
    const logs = storage.getLogsConfig(newGuild.id);
    const changes = [];
    if (oldGuild.name !== newGuild.name) changes.push(`Name: \`${oldGuild.name}\` → \`${newGuild.name}\``);
    if (oldGuild.iconURL() !== newGuild.iconURL()) changes.push('Server icon changed');
    if (!changes.length) return;
    const embed = new EmbedBuilder()
      .setColor(color('#9b59b6'))
      .setTitle('⚙️ Server Updated')
      .setDescription(changes.join('\n'))
      .setTimestamp();
    await send(newGuild, logs.guildLogId, embed);
  });

  client.on('roleCreate', async (role) => {
    const logs = storage.getLogsConfig(role.guild.id);
    const embed = new EmbedBuilder()
      .setColor(color('#2ecc71'))
      .setTitle('🎭 Role Created')
      .setDescription(`${role}`)
      .setTimestamp();
    await send(role.guild, logs.guildLogId, embed);
  });

  client.on('roleDelete', async (role) => {
    const logs = storage.getLogsConfig(role.guild.id);
    const embed = new EmbedBuilder()
      .setColor(color('#e74c3c'))
      .setTitle('🎭 Role Deleted')
      .setDescription(`\`${role.name}\``)
      .setTimestamp();
    await send(role.guild, logs.guildLogId, embed);
  });

  // ---- Message log: edits / deletes ----
  client.on('messageDelete', async (message) => {
    if (!message.guild || message.author?.bot) return;
    const logs = storage.getLogsConfig(message.guild.id);
    const embed = new EmbedBuilder()
      .setColor(color('#e74c3c'))
      .setTitle('🗑️ Message Deleted')
      .addFields(
        { name: 'Author', value: `${message.author ?? 'Unknown'}`, inline: true },
        { name: 'Channel', value: `${message.channel}`, inline: true },
        { name: 'Content', value: message.content?.slice(0, 1000) || '*No cached content*' }
      )
      .setTimestamp();
    await send(message.guild, logs.msgLogId, embed);
  });

  client.on('messageUpdate', async (oldMessage, newMessage) => {
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;
    const logs = storage.getLogsConfig(newMessage.guild.id);
    const embed = new EmbedBuilder()
      .setColor(color('#f1c40f'))
      .setTitle('✏️ Message Edited')
      .addFields(
        { name: 'Author', value: `${newMessage.author}`, inline: true },
        { name: 'Channel', value: `${newMessage.channel}`, inline: true },
        { name: 'Before', value: oldMessage.content?.slice(0, 500) || '*No cached content*' },
        { name: 'After', value: newMessage.content?.slice(0, 500) || '*empty*' }
      )
      .setTimestamp();
    await send(newMessage.guild, logs.msgLogId, embed);
  });

  // ---- Voice log: join / leave / move ----
  client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = newState.guild;
    const logs = storage.getLogsConfig(guild.id);
    if (!logs.vcLogId) return;
    const member = newState.member;

    if (!oldState.channel && newState.channel) {
      const embed = new EmbedBuilder()
        .setColor(color('#2ecc71'))
        .setDescription(`🔊 ${member} joined ${newState.channel}`)
        .setTimestamp();
      await send(guild, logs.vcLogId, embed);
    } else if (oldState.channel && !newState.channel) {
      const embed = new EmbedBuilder()
        .setColor(color('#e74c3c'))
        .setDescription(`🔇 ${member} left ${oldState.channel}`)
        .setTimestamp();
      await send(guild, logs.vcLogId, embed);
    } else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
      const embed = new EmbedBuilder()
        .setColor(color('#f1c40f'))
        .setDescription(`🔀 ${member} moved from ${oldState.channel} to ${newState.channel}`)
        .setTimestamp();
      await send(guild, logs.vcLogId, embed);
    }
  });

  // ---- Mod log: catch bans/kicks that happen outside the bot's own commands too ----
  client.on('guildBanAdd', async (ban) => {
    const logs = storage.getLogsConfig(ban.guild.id);
    if (!logs.modLogId) return;
    const embed = new EmbedBuilder()
      .setColor(color('#e74c3c'))
      .setTitle('🔨 Member Banned')
      .setDescription(`${ban.user?.tag ?? ban.user?.id ?? 'Unknown user'}`)
      .setTimestamp();
    await send(ban.guild, logs.modLogId, embed);
  });
}

module.exports = { registerLoggingListeners, logModAction };
