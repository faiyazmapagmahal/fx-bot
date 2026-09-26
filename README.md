# Anti-Nuke + Moderation Discord Bot

A Discord bot that protects your server from mass-destruction attacks (compromised
admin accounts, malicious mods, self-botting) and gives you a full moderation toolkit.

## What it does

**Anti-nuke protection** — watches the audit log in real time and auto-punishes anyone who,
within a short time window, does things like:
- Mass-deletes or mass-creates channels
- Mass-deletes or mass-creates roles
- Mass-bans or mass-kicks members
- Creates suspicious webhooks (common way to keep access after being kicked)
- Adds an unauthorized bot
- Grants themselves/another account dangerous permissions (Administrator, Ban Members, etc.)

When triggered, the bot strips the offender's roles immediately, then bans or kicks them
(configurable), and posts an alert to your log channel. Server owners and whitelisted
users/roles are always exempt.

**Moderation commands** — ban, kick, timeout, warn (with a persistent warning history),
purge, channel lock/unlock, slowmode.

**Utility commands** — `/afk`, `/avatar`, `/userinfo`, `/serverinfo`, `/snipe` and
`/editsnipe` (recover the last deleted/edited message in a channel), `/clearsnipe`,
`/stats`, `/autorole` (auto-assign a role to new members), `/joinvc` / `/leavevc`.

**Automod** — `/automod toggle` for antilink (blocks links/invites, with an allowlist),
antimention (auto-timeouts mass-ping spam), antinsfw (deletes flagged images), antispam
(auto-timeouts users who flood messages), and antiraid (detects mass-join bot raids and
auto-kicks new joiners during a lockdown window). Antinsfw needs a `DEEPAI_API_KEY` (see
below) — without it the toggle works but nothing actually gets scanned. Antispam and
antiraid tune their limits via `/automod threshold` with an optional `windowseconds`.
Antiraid alerts post to whatever channel you set with `/antinuke setlogchannel`, since
it's the same "server under attack" alert stream as anti-nuke.

**Social watch** — `/youtube add`, `/instagram add`, `/tiktok add` post an alert to a
channel when the account uploads/posts. YouTube is fully functional with a free
Google API key. Instagram and TikTok have no official public API for watching someone
else's account, so those two are wired up as commands + storage but need you to plug in
a third-party provider — see `src/socialWatch.js` for exactly where.

**Welcome messages** — `/welcome setup` (channel + optional custom message with
`{user}`, `{username}`, `{server}`, `{memberCount}` placeholders), `/welcome setcolor`,
`/welcome setthumbnail` (defaults to the new member's avatar if you don't set one),
`/welcome setimage` (a banner image across the bottom), `/welcome status` (shows a live
preview), `/welcome disable`.

## Setup

1. **Create the bot application**
   - Go to https://discord.com/developers/applications → New Application
   - Under "Bot", create a bot user and copy its token
   - Under "OAuth2 → General", copy the Client ID
   - Under "Bot", enable these **Privileged Gateway Intents**: Server Members Intent,
     Message Content Intent

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Fill in `DISCORD_TOKEN` and `CLIENT_ID` in `.env`. Optionally set `GUILD_ID` to your
   test server's ID for instant command updates while developing (global commands take
   up to an hour to propagate).

4. **Invite the bot to your server**
   Use this URL (replace `YOUR_CLIENT_ID`), which grants Administrator so the bot can
   always out-rank and act on any role except the owner's:
   ```
   https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot%20applications.commands
   ```
   For tighter security, you can instead grant only: Ban Members, Kick Members,
   Manage Roles, Manage Channels, Manage Webhooks, Moderate Members, Manage Messages,
   View Audit Log. **Important:** the bot's own role must be moved above any role you
   want it able to strip/punish, in Server Settings → Roles.

5. **Deploy slash commands**
   ```bash
   npm run deploy
   ```

6. **Start the bot**
   ```bash
   npm start
   ```

## First-time configuration in Discord

Run these as a server admin:

```
/antinuke setlogchannel channel:#security-log
/antinuke enable
/whitelist add user:@your-trusted-co-admin
```

Check `/antinuke status` any time to see current thresholds and settings.

## Optional feature keys

None of these are required for anti-nuke or core moderation to work — only add the
ones you actually want:

- **`DEEPAI_API_KEY`** — powers `/automod antinsfw`. Free tier at https://deepai.org/api-docs/nsfw-detector.
- **`YOUTUBE_API_KEY`** — powers `/youtube`. Create a project in Google Cloud Console,
  enable "YouTube Data API v3," then generate an API key under Credentials. Free quota
  comfortably covers polling every 5 minutes for a handful of channels.
- **`INSTAGRAM_API_KEY`** / **`TIKTOK_API_KEY`** — powers `/instagram` and `/tiktok`.
  There's no official free API for monitoring another account's public posts on either
  platform. You'll need a third-party provider (several exist on RapidAPI) or your own
  scraping service. Once you have one, open `src/socialWatch.js` and fill in the two
  `fetchLatest...Post()` functions — they're marked with `TODO` comments showing exactly
  what shape of data to return. Everything else (dedup, per-guild watch lists, posting
  to Discord) already works.

Add whichever keys you want to `.env`, restart the bot, and the matching commands will
start actually doing something instead of just saving a no-op watch.

## Tuning detection sensitivity

Edit the `thresholds` block in `config.json` (this is the default for new servers —
existing servers keep whatever was in `data.json` when they first ran). Each threshold
is `{ limit, windowSeconds }` — e.g. `channelDelete: { limit: 3, windowSeconds: 15 }`
means "3 channel deletions by the same person within 15 seconds triggers punishment."
Lower the limit / widen the window for stricter protection; raise it if legitimate
admins are tripping it during bulk cleanup work.

## Notes & limitations

- Data (warnings, whitelist, per-guild settings) is stored in a local `data.json` file.
  Fine for a single-server or small-scale bot; migrate to a real database if you need
  multi-process hosting or heavier scale.
- Anti-nuke relies on Discord's audit log, which can occasionally lag by a second or two
  — the bot waits briefly and matches actions to their executor within a 10-second window.
- The bot cannot act against the server owner or against accounts with a role higher than
  its own — keep the bot's role near the top of your hierarchy.
- Antiraid is a blunt instrument by design: once triggered, it kicks *any* non-whitelisted
  new joiner for the lockdown duration, including legitimate people who happen to join
  during that window. Set `joinLimit`/`windowseconds` based on your server's normal growth
  rate to avoid false positives, and lower `lockdownMinutes` if you'd rather it clear itself
  faster. You can also lift it early with `/automod toggle filter:antiraid enabled:false`.
- No bot can prevent 100% of abuse (e.g., an attacker with an alt at equal role level
  acting instantly). Combine this with good hygiene: limit who has dangerous permissions,
  use 2FA requirements, and audit your integrations/webhooks periodically.
