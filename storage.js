// Lightweight JSON-file storage. No external DB required.
// Swap this out for Postgres/Mongo/SQLite later if you outgrow it -
// every function signature here is what you'd need to replicate.

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');
const DEFAULT_CONFIG = require('./config.json');

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const initial = { guilds: {} };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    console.error('Failed to parse data.json, starting fresh:', err);
    return { guilds: {} };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function freshGuildDefaults() {
  return {
    antiNuke: JSON.parse(JSON.stringify(DEFAULT_CONFIG.antiNuke)),
    whitelistedUserIds: [...DEFAULT_CONFIG.whitelistedUserIds],
    whitelistedRoleIds: [...DEFAULT_CONFIG.whitelistedRoleIds],
    warnings: {}, // userId -> [{ reason, moderatorId, timestamp }]
    afk: {}, // userId -> { reason, timestamp }
    autoRoleId: DEFAULT_CONFIG.autoRoleId,
    automod: JSON.parse(JSON.stringify(DEFAULT_CONFIG.automod)),
    socialWatch: JSON.parse(JSON.stringify(DEFAULT_CONFIG.socialWatch)),
    welcome: JSON.parse(JSON.stringify(DEFAULT_CONFIG.welcome)),
    logs: {
      channelLogId: null,
      guildLogId: null,
      msgLogId: null,
      vcLogId: null,
      modLogId: null,
      levelLogId: null
    }
  };
}

function mergeDefaults(target, defaults) {
  let changed = false;
  for (const key of Object.keys(defaults)) {
    if (!(key in target)) {
      target[key] = defaults[key];
      changed = true;
    } else if (
      typeof defaults[key] === 'object' &&
      defaults[key] !== null &&
      !Array.isArray(defaults[key]) &&
      typeof target[key] === 'object' &&
      target[key] !== null &&
      !Array.isArray(target[key])
    ) {
      if (mergeDefaults(target[key], defaults[key])) changed = true;
    }
  }
  return changed;
}

function getGuildData(guildId) {
  const data = loadData();
  if (!data.guilds[guildId]) {
    data.guilds[guildId] = freshGuildDefaults();
    saveData(data);
  } else {
    // Backfill any fields (including nested ones) added after this guild's record was first created
    const changed = mergeDefaults(data.guilds[guildId], freshGuildDefaults());
    if (changed) saveData(data);
  }
  return data.guilds[guildId];
}

function updateGuildData(guildId, updater) {
  const data = loadData();
  if (!data.guilds[guildId]) {
    data.guilds[guildId] = getGuildData(guildId);
  }
  updater(data.guilds[guildId]);
  saveData(data);
  return data.guilds[guildId];
}

// ---- Warnings ----

function addWarning(guildId, userId, reason, moderatorId) {
  return updateGuildData(guildId, (g) => {
    if (!g.warnings[userId]) g.warnings[userId] = [];
    g.warnings[userId].push({ reason, moderatorId, timestamp: Date.now() });
  }).warnings[userId];
}

function clearWarnings(guildId, userId) {
  updateGuildData(guildId, (g) => {
    g.warnings[userId] = [];
  });
}

function getWarnings(guildId, userId) {
  return getGuildData(guildId).warnings[userId] || [];
}

// ---- Whitelist ----

function addToWhitelist(guildId, userId) {
  return updateGuildData(guildId, (g) => {
    if (!g.whitelistedUserIds.includes(userId)) g.whitelistedUserIds.push(userId);
  }).whitelistedUserIds;
}

function removeFromWhitelist(guildId, userId) {
  return updateGuildData(guildId, (g) => {
    g.whitelistedUserIds = g.whitelistedUserIds.filter((id) => id !== userId);
  }).whitelistedUserIds;
}

function isWhitelisted(guildId, member) {
  const g = getGuildData(guildId);
  if (g.whitelistedUserIds.includes(member.id)) return true;
  if (member.roles?.cache) {
    for (const roleId of g.whitelistedRoleIds) {
      if (member.roles.cache.has(roleId)) return true;
    }
  }
  return false;
}

// ---- Anti-nuke settings ----

function setLogChannel(guildId, channelId) {
  updateGuildData(guildId, (g) => {
    g.antiNuke.logChannelId = channelId;
  });
}

function setPunishment(guildId, punishment) {
  updateGuildData(guildId, (g) => {
    g.antiNuke.punishment = punishment;
  });
}

function setAntiNukeEnabled(guildId, enabled) {
  updateGuildData(guildId, (g) => {
    g.antiNuke.enabled = enabled;
  });
}

// ---- AFK ----

function setAfk(guildId, userId, reason) {
  updateGuildData(guildId, (g) => {
    g.afk[userId] = { reason: reason || 'AFK', timestamp: Date.now() };
  });
}

function clearAfk(guildId, userId) {
  const g = getGuildData(guildId);
  const had = g.afk[userId];
  if (had) {
    updateGuildData(guildId, (g2) => {
      delete g2.afk[userId];
    });
  }
  return had || null;
}

function getAfk(guildId, userId) {
  return getGuildData(guildId).afk[userId] || null;
}

// ---- Autorole ----

function setAutoRole(guildId, roleId) {
  updateGuildData(guildId, (g) => {
    g.autoRoleId = roleId;
  });
}

function getAutoRole(guildId) {
  return getGuildData(guildId).autoRoleId;
}

// ---- Automod ----

function setAutomodEnabled(guildId, feature, enabled) {
  updateGuildData(guildId, (g) => {
    g.automod[feature].enabled = enabled;
  });
}

function setAutomodThreshold(guildId, feature, value) {
  updateGuildData(guildId, (g) => {
    g.automod[feature].threshold = value;
  });
}

function setAutomodField(guildId, feature, field, value) {
  updateGuildData(guildId, (g) => {
    g.automod[feature][field] = value;
  });
}

function addAutomodExemptChannel(guildId, feature, channelId) {
  updateGuildData(guildId, (g) => {
    if (!g.automod[feature].exemptChannelIds.includes(channelId)) {
      g.automod[feature].exemptChannelIds.push(channelId);
    }
  });
}

function removeAutomodExemptChannel(guildId, feature, channelId) {
  updateGuildData(guildId, (g) => {
    g.automod[feature].exemptChannelIds = g.automod[feature].exemptChannelIds.filter(
      (id) => id !== channelId
    );
  });
}

function addAllowedDomain(guildId, domain) {
  updateGuildData(guildId, (g) => {
    if (!g.automod.antilink.allowedDomains.includes(domain)) {
      g.automod.antilink.allowedDomains.push(domain);
    }
  });
}

function removeAllowedDomain(guildId, domain) {
  updateGuildData(guildId, (g) => {
    g.automod.antilink.allowedDomains = g.automod.antilink.allowedDomains.filter((d) => d !== domain);
  });
}

// ---- Social watch ----

function addSocialWatch(guildId, platform, entry) {
  return updateGuildData(guildId, (g) => {
    g.socialWatch[platform].push(entry);
  }).socialWatch[platform];
}

function removeSocialWatch(guildId, platform, account) {
  return updateGuildData(guildId, (g) => {
    g.socialWatch[platform] = g.socialWatch[platform].filter(
      (e) => e.account.toLowerCase() !== account.toLowerCase()
    );
  }).socialWatch[platform];
}

function listSocialWatch(guildId, platform) {
  return getGuildData(guildId).socialWatch[platform];
}

function updateSocialWatchLastId(guildId, platform, account, lastId) {
  updateGuildData(guildId, (g) => {
    const entry = g.socialWatch[platform].find(
      (e) => e.account.toLowerCase() === account.toLowerCase()
    );
    if (entry) entry.lastId = lastId;
  });
}

function getAllGuildIds() {
  return Object.keys(loadData().guilds);
}

// ---- Welcome messages ----

function setupWelcome(guildId, channelId, message) {
  updateGuildData(guildId, (g) => {
    g.welcome.enabled = true;
    g.welcome.channelId = channelId;
    if (message) g.welcome.message = message;
  });
}

function setWelcomeColor(guildId, color) {
  updateGuildData(guildId, (g) => {
    g.welcome.color = color;
  });
}

function setWelcomeThumbnail(guildId, url) {
  updateGuildData(guildId, (g) => {
    g.welcome.thumbnailUrl = url;
  });
}

function setWelcomeImage(guildId, url) {
  updateGuildData(guildId, (g) => {
    g.welcome.imageUrl = url;
  });
}

function setWelcomeEnabled(guildId, enabled) {
  updateGuildData(guildId, (g) => {
    g.welcome.enabled = enabled;
  });
}

function getWelcomeConfig(guildId) {
  return getGuildData(guildId).welcome;
}

// ---- Logging channels ----

function setChannelLog(guildId, channelId) {
  updateGuildData(guildId, (g) => {
    g.logs.channelLogId = channelId;
  });
}

function setGuildLog(guildId, channelId) {
  updateGuildData(guildId, (g) => {
    g.logs.guildLogId = channelId;
  });
}

function setMsgLog(guildId, channelId) {
  updateGuildData(guildId, (g) => {
    g.logs.msgLogId = channelId;
  });
}

function setVcLog(guildId, channelId) {
  updateGuildData(guildId, (g) => {
    g.logs.vcLogId = channelId;
  });
}

function setModLog(guildId, channelId) {
  updateGuildData(guildId, (g) => {
    g.logs.modLogId = channelId;
  });
}

function setLevelLog(guildId, channelId) {
  updateGuildData(guildId, (g) => {
    g.logs.levelLogId = channelId;
  });
}

function getLogsConfig(guildId) {
  return getGuildData(guildId).logs;
}

module.exports = {
  getGuildData,
  updateGuildData,
  addWarning,
  clearWarnings,
  getWarnings,
  addToWhitelist,
  removeFromWhitelist,
  isWhitelisted,
  setLogChannel,
  setPunishment,
  setAntiNukeEnabled,
  setAfk,
  clearAfk,
  getAfk,
  setAutoRole,
  getAutoRole,
  setAutomodEnabled,
  setAutomodThreshold,
  setAutomodField,
  addAutomodExemptChannel,
  removeAutomodExemptChannel,
  addAllowedDomain,
  removeAllowedDomain,
  addSocialWatch,
  removeSocialWatch,
  listSocialWatch,
  updateSocialWatchLastId,
  getAllGuildIds,
  setupWelcome,
  setWelcomeColor,
  setWelcomeThumbnail,
  setWelcomeImage,
  setWelcomeEnabled,
  getWelcomeConfig,
  setChannelLog,
  setGuildLog,
  setMsgLog,
  setVcLog,
  setModLog,
  setLevelLog,
  getLogsConfig
};
