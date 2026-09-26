const storage = require('./storage');

// In-memory: guildId -> array of join timestamps (for threshold detection)
const joinLog = new Map();
// In-memory: guildId -> timestamp when raid lockdown expires
const raidLockdownUntil = new Map();

function recordJoin(guildId) {
  const now = Date.now();
  const arr = joinLog.get(guildId) || [];
  arr.push(now);
  joinLog.set(guildId, arr);
  return arr;
}

function countWithinWindow(arr, windowSeconds) {
  const cutoff = Date.now() - windowSeconds * 1000;
  return arr.filter((t) => t >= cutoff).length;
}

async function notify(guild, message) {
  const logChannelId = storage.getGuildData(guild.id).antiNuke.logChannelId;
  if (!logChannelId) return;
  const channel = guild.channels.cache.get(logChannelId);
  if (channel?.isTextBased()) channel.send(message).catch(() => null);
}

function isRaidModeActive(guildId) {
  const until = raidLockdownUntil.get(guildId);
  return until && Date.now() < until;
}

function registerAntiRaidListener(client) {
  client.on('guildMemberAdd', async (member) => {
    const guild = member.guild;
    const data = storage.getGuildData(guild.id);
    const config = data.automod.antiraid;
    if (!config.enabled) return;

    // If we're already in lockdown, auto-kick this joiner (unless whitelisted) and stop.
    if (isRaidModeActive(guild.id)) {
      if (storage.isWhitelisted(guild.id, member)) return;
      await member.kick('Anti-raid: server is in lockdown following a detected raid').catch(() => null);
      await notify(guild, `🚫 Kicked **${member.user.tag}** — joined during active raid lockdown.`);
      return;
    }

    const arr = recordJoin(guild.id);
    const count = countWithinWindow(arr, config.windowSeconds);

    if (count >= config.joinLimit) {
      joinLog.set(guild.id, []); // reset counter
      const until = Date.now() + config.lockdownMinutes * 60 * 1000;
      raidLockdownUntil.set(guild.id, until);

      await notify(
        guild,
        `🛡️ **Raid detected** — ${count} members joined within ${config.windowSeconds}s.\n` +
          `Lockdown active for ${config.lockdownMinutes} minute(s): new joiners will be auto-kicked ` +
          `unless whitelisted. Use \`/automod toggle filter:antiraid enabled:false\` to lift it early.`
      );
    }
  });
}

module.exports = { registerAntiRaidListener, isRaidModeActive };
