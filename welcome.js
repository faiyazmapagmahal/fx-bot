const { EmbedBuilder } = require('discord.js');
const storage = require('./storage');

const HEX_COLOR_REGEX = /^#?[0-9a-f]{6}$/i;

function fillPlaceholders(template, member) {
  return template
    .replace(/{user}/g, `${member}`)
    .replace(/{username}/g, member.user.username)
    .replace(/{server}/g, member.guild.name)
    .replace(/{memberCount}/g, `${member.guild.memberCount}`);
}

function resolveColor(hex) {
  if (!hex || !HEX_COLOR_REGEX.test(hex)) return 0x5865f2;
  return parseInt(hex.replace('#', ''), 16);
}

function registerWelcomeListener(client) {
  client.on('guildMemberAdd', async (member) => {
    const config = storage.getWelcomeConfig(member.guild.id);
    if (!config.enabled || !config.channelId) return;

    const channel = member.guild.channels.cache.get(config.channelId);
    if (!channel?.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setDescription(fillPlaceholders(config.message, member))
      .setColor(resolveColor(config.color))
      .setThumbnail(config.thumbnailUrl || member.user.displayAvatarURL({ size: 512 }))
      .setTimestamp();

    if (config.imageUrl) embed.setImage(config.imageUrl);

    channel.send({ embeds: [embed] }).catch((err) => {
      console.error(`Failed to send welcome message in ${member.guild.name}:`, err.message);
    });
  });
}

module.exports = { registerWelcomeListener, fillPlaceholders, resolveColor };
