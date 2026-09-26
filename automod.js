const storage = require('./storage');

const URL_REGEX = /https?:\/\/([^\s/]+)/gi;
const IMAGE_EXT_REGEX = /\.(png|jpe?g|gif|webp)$/i;

// In-memory sliding-window message tracker for antispam: `${guildId}:${userId}` -> timestamps[]
const messageLog = new Map();

function recordMessage(guildId, userId) {
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const arr = messageLog.get(key) || [];
  arr.push(now);
  messageLog.set(key, arr);
  return arr;
}

function countWithinWindow(arr, windowSeconds) {
  const cutoff = Date.now() - windowSeconds * 1000;
  return arr.filter((t) => t >= cutoff).length;
}

function extractDomains(content) {
  const matches = [...content.matchAll(URL_REGEX)];
  return matches.map((m) => m[1].toLowerCase().replace(/^www\./, ''));
}

async function checkNsfwImage(url) {
  const apiKey = process.env.DEEPAI_API_KEY;
  if (!apiKey) {
    console.warn('DEEPAI_API_KEY not set — antinsfw is enabled but cannot scan images. Skipping.');
    return null;
  }
  try {
    const res = await fetch('https://api.deepai.org/api/nsfw-detector', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: url })
    });
    const data = await res.json();
    return data?.output?.nsfw_score ?? null;
  } catch (err) {
    console.error('NSFW check failed:', err.message);
    return null;
  }
}

async function handleAutomod(message) {
  if (message.author.bot || !message.guild) return;
  const member = message.member;
  if (!member) return;
  if (member.permissions.has('Administrator')) return;
  if (storage.isWhitelisted(message.guild.id, member)) return;

  const data = storage.getGuildData(message.guild.id);
  const { antilink, antimention, antinsfw, antispam } = data.automod;

  // --- Antispam (message flood) ---
  if (antispam.enabled && !antispam.exemptChannelIds.includes(message.channel.id)) {
    const arr = recordMessage(message.guild.id, message.author.id);
    const count = countWithinWindow(arr, antispam.windowSeconds);
    if (count > antispam.messageLimit) {
      messageLog.delete(`${message.guild.id}:${message.author.id}`); // reset after triggering
      await message.delete().catch(() => null);
      const target = await message.guild.members.fetch(message.author.id).catch(() => null);
      if (target?.moderatable) {
        await target.timeout(5 * 60 * 1000, 'Automod: message spam').catch(() => null);
      }
      await message.channel
        .send(`🚫 ${message.author} was timed out for spamming messages.`)
        .catch(() => null);
      return;
    }
  }

  // --- Antilink ---
  if (antilink.enabled && !antilink.exemptChannelIds.includes(message.channel.id)) {
    const domains = extractDomains(message.content);
    const isDiscordInvite = /discord\.gg|discord\.com\/invite/i.test(message.content);
    const hasDisallowed =
      domains.length > 0 &&
      (isDiscordInvite || domains.some((d) => !antilink.allowedDomains.includes(d)));

    if (hasDisallowed) {
      await message.delete().catch(() => null);
      await message.channel
        .send(`🔗 ${message.author}, links aren't allowed here.`)
        .then((m) => setTimeout(() => m.delete().catch(() => null), 5000))
        .catch(() => null);
      return; // don't double-process a message we just deleted
    }
  }

  // --- Antimention (mass mention / ghost-ping spam) ---
  if (antimention.enabled && !antimention.exemptChannelIds.includes(message.channel.id)) {
    const mentionCount = message.mentions.users.size + message.mentions.roles.size;
    if (mentionCount >= antimention.threshold) {
      await message.delete().catch(() => null);
      const target = await message.guild.members.fetch(message.author.id).catch(() => null);
      if (target?.moderatable) {
        await target.timeout(10 * 60 * 1000, 'Automod: mass mention spam').catch(() => null);
      }
      await message.channel
        .send(`🚫 ${message.author} was timed out for mass-mentioning (${mentionCount} pings).`)
        .catch(() => null);
      return;
    }
  }

  // --- Antinsfw ---
  if (antinsfw.enabled && !antinsfw.exemptChannelIds.includes(message.channel.id)) {
    const attachment = message.attachments.find((a) => IMAGE_EXT_REGEX.test(a.name || a.url));
    if (attachment) {
      const score = await checkNsfwImage(attachment.url);
      if (score !== null && score >= antinsfw.threshold) {
        await message.delete().catch(() => null);
        await message.channel
          .send(`🔞 ${message.author}, that image was flagged as NSFW and removed.`)
          .catch(() => null);
      }
    }
  }
}

function registerAutomodListener(client) {
  client.on('messageCreate', (message) => {
    handleAutomod(message).catch((err) => console.error('Automod error:', err));
  });
}

module.exports = { registerAutomodListener };
