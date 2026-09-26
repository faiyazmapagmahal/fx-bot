const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');
const storage = require('./storage');
const { fillPlaceholders, resolveColor } = require('./welcome');

const HEX_COLOR_REGEX = /^#?[0-9a-f]{6}$/i;
const URL_REGEX = /^https?:\/\/.+/i;

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('welcome')
      .setDescription('Configure welcome messages for new members')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((sub) =>
        sub
          .setName('setup')
          .setDescription('Set (or update) the welcome channel and message, and enable welcome messages')
          .addChannelOption((o) =>
            o
              .setName('channel')
              .setDescription('Channel to post welcome messages in')
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(true)
          )
          .addStringOption((o) =>
            o
              .setName('message')
              .setDescription('Use {user}, {username}, {server}, {memberCount} as placeholders')
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName('setcolor')
          .setDescription('Set the embed color for welcome messages')
          .addStringOption((o) =>
            o.setName('color').setDescription('Hex color, e.g. #5865F2').setRequired(true)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName('setthumbnail')
          .setDescription("Set a custom thumbnail (small image). Omit the URL to reset to the member's avatar.")
          .addStringOption((o) => o.setName('url').setDescription('Image URL'))
      )
      .addSubcommand((sub) =>
        sub
          .setName('setimage')
          .setDescription('Set the large banner image. Omit the URL to remove it.')
          .addStringOption((o) => o.setName('url').setDescription('Image URL'))
      )
      .addSubcommand((sub) => sub.setName('status').setDescription('Show current welcome configuration and preview it'))
      .addSubcommand((sub) => sub.setName('disable').setDescription('Turn off welcome messages')),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guild.id;

      if (sub === 'setup') {
        const channel = interaction.options.getChannel('channel');
        const message = interaction.options.getString('message');
        storage.setupWelcome(guildId, channel.id, message);
        return interaction.reply(
          `✅ Welcome messages enabled in ${channel}.` +
            (message ? '' : ' Using the default message — customize it any time by running `/welcome setup` again.')
        );
      }

      if (sub === 'setcolor') {
        const color = interaction.options.getString('color');
        if (!HEX_COLOR_REGEX.test(color)) {
          return interaction.reply({ content: 'That doesn\'t look like a valid hex color, e.g. `#5865F2`.', ephemeral: true });
        }
        storage.setWelcomeColor(guildId, color.startsWith('#') ? color : `#${color}`);
        return interaction.reply(`✅ Welcome embed color set to \`${color}\`.`);
      }

      if (sub === 'setthumbnail') {
        const url = interaction.options.getString('url');
        if (url && !URL_REGEX.test(url)) {
          return interaction.reply({ content: 'That needs to be a valid image URL.', ephemeral: true });
        }
        storage.setWelcomeThumbnail(guildId, url || null);
        return interaction.reply(
          url ? '✅ Welcome thumbnail updated.' : "✅ Welcome thumbnail reset to each member's avatar."
        );
      }

      if (sub === 'setimage') {
        const url = interaction.options.getString('url');
        if (url && !URL_REGEX.test(url)) {
          return interaction.reply({ content: 'That needs to be a valid image URL.', ephemeral: true });
        }
        storage.setWelcomeImage(guildId, url || null);
        return interaction.reply(url ? '✅ Welcome banner image set.' : '✅ Welcome banner image removed.');
      }

      if (sub === 'disable') {
        storage.setWelcomeEnabled(guildId, false);
        return interaction.reply('✅ Welcome messages disabled. Your settings are kept — `/welcome setup` re-enables them.');
      }

      if (sub === 'status') {
        const config = storage.getWelcomeConfig(guildId);
        const summary =
          `**Welcome Message Status**\n` +
          `Enabled: ${config.enabled ? 'Yes' : 'No'}\n` +
          `Channel: ${config.channelId ? `<#${config.channelId}>` : 'Not set'}\n` +
          `Color: ${config.color}\n` +
          `Thumbnail: ${config.thumbnailUrl ? 'Custom image' : "Member's avatar (default)"}\n` +
          `Banner image: ${config.imageUrl ? 'Set' : 'None'}\n` +
          `Message template: ${config.message}`;

        const preview = new EmbedBuilder()
          .setDescription(fillPlaceholders(config.message, interaction.member))
          .setColor(resolveColor(config.color))
          .setThumbnail(config.thumbnailUrl || interaction.user.displayAvatarURL({ size: 512 }))
          .setTimestamp();
        if (config.imageUrl) preview.setImage(config.imageUrl);

        return interaction.reply({ content: summary, embeds: [preview], ephemeral: true });
      }
    }
  }
];
