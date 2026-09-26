// In-memory only, by design — snipe caches are meant to be short-lived,
// not a permanent record of deleted content. Cleared on restart.

const MAX_AGE_MS = 60 * 60 * 1000; // auto-expire entries after 1 hour

const deletedCache = new Map(); // channelId -> { content, authorTag, authorAvatar, timestamp, attachmentUrl }
const editedCache = new Map(); // channelId -> { before, after, authorTag, authorAvatar, timestamp }

function registerSnipeListeners(client) {
  client.on('messageDelete', (message) => {
    if (!message.guild || message.author?.bot) return;
    deletedCache.set(message.channel.id, {
      content: message.content || '*(no text content — attachment or embed only)*',
      authorTag: message.author?.tag || 'Unknown user',
      authorAvatar: message.author?.displayAvatarURL?.() || null,
      attachmentUrl: message.attachments?.first()?.url || null,
      timestamp: Date.now()
    });
  });

  client.on('messageUpdate', (oldMessage, newMessage) => {
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return; // ignore embed-only updates
    editedCache.set(newMessage.channel.id, {
      before: oldMessage.content || '*(empty)*',
      after: newMessage.content || '*(empty)*',
      authorTag: newMessage.author?.tag || 'Unknown user',
      authorAvatar: newMessage.author?.displayAvatarURL?.() || null,
      timestamp: Date.now()
    });
  });
}

function getSnipe(channelId) {
  const entry = deletedCache.get(channelId);
  if (!entry || Date.now() - entry.timestamp > MAX_AGE_MS) return null;
  return entry;
}

function getEditSnipe(channelId) {
  const entry = editedCache.get(channelId);
  if (!entry || Date.now() - entry.timestamp > MAX_AGE_MS) return null;
  return entry;
}

function clearSnipe(channelId) {
  deletedCache.delete(channelId);
  editedCache.delete(channelId);
}

module.exports = { registerSnipeListeners, getSnipe, getEditSnipe, clearSnipe };
