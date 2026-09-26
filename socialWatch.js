const storage = require('./storage');

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// YouTube — uses the official YouTube Data API v3 (requires YOUTUBE_API_KEY).
// This one is fully functional: it resolves a handle/ID to a channel, then
// polls the channel's uploads for the newest video.
// ---------------------------------------------------------------------------

async function resolveYoutubeChannelId(handleOrId) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const clean = handleOrId.replace(/^@/, '');
  const url = `https://www.googleapis.com/youtube/v3/channels?part=id,contentDetails&forHandle=${encodeURIComponent(
    clean
  )}&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.items?.length) return data.items[0];
  return null;
}

async function getLatestYoutubeVideo(uploadsPlaylistId) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=1&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  const item = data.items?.[0];
  if (!item) return null;
  return {
    id: item.snippet.resourceId.videoId,
    title: item.snippet.title,
    url: `https://youtube.com/watch?v=${item.snippet.resourceId.videoId}`,
    thumbnail: item.snippet.thumbnails?.high?.url
  };
}

async function pollYoutube(client, guildId) {
  const watches = storage.listSocialWatch(guildId, 'youtube');
  for (const watch of watches) {
    try {
      const channelInfo = await resolveYoutubeChannelId(watch.account);
      if (!channelInfo) continue;
      const uploadsPlaylistId = channelInfo.contentDetails.relatedPlaylists.uploads;
      const latest = await getLatestYoutubeVideo(uploadsPlaylistId);
      if (!latest || latest.id === watch.lastId) continue;

      storage.updateSocialWatchLastId(guildId, 'youtube', watch.account, latest.id);
      if (!watch.lastId) continue; // first run: just record baseline, don't spam old video

      const channel = client.channels.cache.get(watch.channelId);
      if (channel?.isTextBased()) {
        channel.send(`📺 **${watch.account}** just uploaded: **${latest.title}**\n${latest.url}`);
      }
    } catch (err) {
      console.error(`YouTube poll failed for ${watch.account}:`, err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Instagram / TikTok — there is no official, free API for watching another
// account's public posts. These adapters are stubs: wire up a third-party
// provider (e.g. a RapidAPI Instagram/TikTok endpoint, or your own scraper
// service) and return { id, url, caption } from the newest post. Everything
// else (dedup, storage, posting to Discord) already works once you do.
// ---------------------------------------------------------------------------

async function fetchLatestInstagramPost(username) {
  const apiKey = process.env.INSTAGRAM_API_KEY;
  if (!apiKey) return null; // not configured — see README
  // TODO: replace with your chosen provider's request/response shape, e.g.:
  // const res = await fetch(`https://your-provider.example.com/instagram/${username}/latest`, {
  //   headers: { Authorization: `Bearer ${apiKey}` }
  // });
  // const data = await res.json();
  // return { id: data.id, url: data.permalink, caption: data.caption };
  return null;
}

async function fetchLatestTiktokPost(username) {
  const apiKey = process.env.TIKTOK_API_KEY;
  if (!apiKey) return null; // not configured — see README
  // TODO: same idea as Instagram above — plug in your provider here.
  return null;
}

async function pollGenericPlatform(client, guildId, platform, fetcher, emoji) {
  const watches = storage.listSocialWatch(guildId, platform);
  for (const watch of watches) {
    try {
      const latest = await fetcher(watch.account);
      if (!latest || latest.id === watch.lastId) continue;

      storage.updateSocialWatchLastId(guildId, platform, watch.account, latest.id);
      if (!watch.lastId) continue;

      const channel = client.channels.cache.get(watch.channelId);
      if (channel?.isTextBased()) {
        channel.send(`${emoji} **${watch.account}** posted: ${latest.caption || ''}\n${latest.url}`);
      }
    } catch (err) {
      console.error(`${platform} poll failed for ${watch.account}:`, err.message);
    }
  }
}

async function pollAll(client) {
  for (const guildId of storage.getAllGuildIds()) {
    if (process.env.YOUTUBE_API_KEY) await pollYoutube(client, guildId);
    await pollGenericPlatform(client, guildId, 'instagram', fetchLatestInstagramPost, '📸');
    await pollGenericPlatform(client, guildId, 'tiktok', fetchLatestTiktokPost, '🎵');
  }
}

function startSocialWatchPolling(client) {
  setInterval(() => {
    pollAll(client).catch((err) => console.error('Social watch poll cycle failed:', err));
  }, POLL_INTERVAL_MS);
  // Run once shortly after startup too, so baselines get recorded quickly.
  setTimeout(() => pollAll(client).catch(() => null), 10000);
}

module.exports = { startSocialWatchPolling };
