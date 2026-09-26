const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const storage = require('./storage');

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('automod')
      .setDescription('Configure automatic moderation filters')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((sub) =>
        sub
          .setName('toggle')
          .setDescription('Enable or disable a filter')
          .addStringOption((o) =>
            o
              .setName('filter')
              .setDescription('Which filter')
              .setRequired(true)
              .addChoices(
                { name: 'Antilink', value: 'antilink' },
                { name: 'Antimention', value: 'antimention' },
                { name: 'Antinsfw', value: 'antinsfw' },
                { name: 'Antispam', value: 'antispam' },
                { name: 'Antiraid', value: 'antiraid' }
              )
          )
          .addBooleanOption((o) => o.setName('enabled').setDescription('On or off').setRequired(true))
      )
      .addSubcommand((sub) =>
        sub
          .setName('threshold')
          .setDescription('Set the sensitivity for a filter')
          .addStringOption((o) =>
            o
              .setName('filter')
              .setDescription('Which filter')
              .setRequired(true)
              .addChoices(
                { name: 'Antimention (max pings per message)', value: 'antimention' },
                { name: 'Antinsfw (0.0-1.0 confidence)', value: 'antinsfw' },
                { name: 'Antispam (max messages per window)', value: 'antispam' },
                { name: 'Antiraid (max joins per window)', value: 'antiraid' }
              )
          )
          .addNumberOption((o) => o.setName('value').setDescription('New threshold value').setRequired(true))
          .addIntegerOption((o) =>
            o
              .setName('windowseconds')
              .setDescription('Time window in seconds (antispam/antiraid only)')
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName('allowdomain')
          .setDescription('Allow a domain through antilink')
          .addStringOption((o) => o.setName('domain').setDescription('e.g. youtube.com').setRequired(true))
      )
      .addSubcommand((sub) =>
        sub
          .setName('exempt')
          .setDescription('Exempt a channel from a filter')
          .addStringOption((o) =>
            o
              .setName('filter')
              .setDescription('Which filter')
              .setRequired(true)
              .addChoices(
                { name: 'Antilink', value: 'antilink' },
                { name: 'Antimention', value: 'antimention' },
                { name: 'Antinsfw', value: 'antinsfw' },
                { name: 'Antispam', value: 'antispam' }
              )
          )
          .addChannelOption((o) =>
            o
              .setName('channel')
              .setDescription('Channel to exempt')
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(true)
          )
      )
      .addSubcommand((sub) => sub.setName('status').setDescription('Show current automod configuration')),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guild.id;

      if (sub === 'toggle') {
        const filter = interaction.options.getString('filter');
        const enabled = interaction.options.getBoolean('enabled');
        storage.setAutomodEnabled(guildId, filter, enabled);
        if (filter === 'antinsfw' && enabled && !process.env.DEEPAI_API_KEY) {
          return interaction.reply({
            content:
              `✅ **${filter}** enabled, but no \`DEEPAI_API_KEY\` is set in the bot's environment — ` +
              `images won't actually be scanned until you add one. See the README.`,
            ephemeral: true
          });
        }
        return interaction.reply(`✅ **${filter}** is now **${enabled ? 'enabled' : 'disabled'}**.`);
      }

      if (sub === 'threshold') {
        const filter = interaction.options.getString('filter');
        const value = interaction.options.getNumber('value');
        const windowSeconds = interaction.options.getInteger('windowseconds');

        if (filter === 'antispam') {
          storage.setAutomodField(guildId, filter, 'messageLimit', value);
          if (windowSeconds) storage.setAutomodField(guildId, filter, 'windowSeconds', windowSeconds);
        } else if (filter === 'antiraid') {
          storage.setAutomodField(guildId, filter, 'joinLimit', value);
          if (windowSeconds) storage.setAutomodField(guildId, filter, 'windowSeconds', windowSeconds);
        } else {
          storage.setAutomodThreshold(guildId, filter, value);
        }
        return interaction.reply(
          `✅ **${filter}** threshold set to **${value}**` +
            (windowSeconds ? ` (window: ${windowSeconds}s)` : '') +
            `.`
        );
      }

      if (sub === 'allowdomain') {
        const domain = interaction.options.getString('domain').toLowerCase().replace(/^www\./, '');
        storage.addAllowedDomain(guildId, domain);
        return interaction.reply(`✅ **${domain}** links are now allowed.`);
      }

      if (sub === 'exempt') {
        const filter = interaction.options.getString('filter');
        const channel = interaction.options.getChannel('channel');
        storage.addAutomodExemptChannel(guildId, filter, channel.id);
        return interaction.reply(`✅ ${channel} is now exempt from **${filter}**.`);
      }

      if (sub === 'status') {
        const data = storage.getGuildData(guildId);
        const { antilink, antimention, antinsfw, antispam, antiraid } = data.automod;
        return interaction.reply({
          content:
            `**Automod Status**\n\n` +
            `**Antilink:** ${antilink.enabled ? 'On' : 'Off'}\n` +
            `Allowed domains: ${antilink.allowedDomains.join(', ') || 'none'}\n\n` +
            `**Antimention:** ${antimention.enabled ? 'On' : 'Off'} (threshold: ${antimention.threshold})\n\n` +
            `**Antinsfw:** ${antinsfw.enabled ? 'On' : 'Off'} (threshold: ${antinsfw.threshold})\n` +
            `${process.env.DEEPAI_API_KEY ? '' : '⚠️ No DEEPAI_API_KEY configured — antinsfw cannot scan images.\n'}\n` +
            `**Antispam:** ${antispam.enabled ? 'On' : 'Off'} (${antispam.messageLimit} msgs / ${antispam.windowSeconds}s)\n\n` +
            `**Antiraid:** ${antiraid.enabled ? 'On' : 'Off'} (${antiraid.joinLimit} joins / ${antiraid.windowSeconds}s, ${antiraid.lockdownMinutes}min lockdown)\n` +
            `Alerts post to the anti-nuke log channel (set with \`/antinuke setlogchannel\`).`,
          ephemeral: true
        });
      }
    }
  }
];
