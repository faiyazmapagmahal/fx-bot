const storage = require('./storage');

function registerAfkListener(client) {
  client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // Coming back from AFK
    const own = storage.getAfk(message.guild.id, message.author.id);
    if (own) {
      storage.clearAfk(message.guild.id, message.author.id);
      message.reply(`👋 Welcome back, ${message.author}! I removed your AFK status.`).catch(() => null);

      const member = message.member;
      if (member?.manageable && member.nickname?.startsWith('[AFK] ')) {
        member.setNickname(member.nickname.replace('[AFK] ', '')).catch(() => null);
      }
    }

    // Notify if this message pings someone who is AFK
    if (message.mentions.users.size > 0) {
      for (const [, user] of message.mentions.users) {
        if (user.bot) continue;
        const afk = storage.getAfk(message.guild.id, user.id);
        if (afk) {
          const minutesAgo = Math.floor((Date.now() - afk.timestamp) / 60000);
          message.reply(`💤 **${user.tag}** is AFK: ${afk.reason} (${minutesAgo}m ago)`).catch(() => null);
        }
      }
    }
  });
}

module.exports = { registerAfkListener };
