const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const storage = require('./storage');

function channelSubcommand(name, description) {
  return (sub) =>
    sub
      .setName(name)
      .setDescription(description)
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Channel to send these logs to')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      );
}

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('logs')
      .setDescription('Configure logging channels')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addSubcommand(channelSubcommand('setchannellog', 'Set the channel for channel create/delete/update logs'))
      .addSubcommand(channelSubcommand('setguildlog', 'Set the channel for server (guild) setting change logs'))
      .addSubcommand(channelSubcommand('setmsglog', 'Set the channel for message edit/delete logs'))
      .addSubcommand(channelSubcommand('setvclog', 'Set the channel for voice channel join/leave/move logs'))
      .addSubcommand(channelSubcommand('setmodlog', 'Set the channel for moderation action logs (ban/kick/warn/timeout)'))
      .addSubcommand(channelSubcommand('setlevellog', 'Set the channel for level-up logs'))
      .addSubcommand((sub) => sub.setName('status').setDescription('View all configured logging channels')),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guild.id;

      const setters = {
        setchannellog: { fn: storage.setChannelLog, label: 'Channel log' },
        setguildlog: { fn: storage.setGuildLog, label: 'Guild log' },
        setmsglog: { fn: storage.setMsgLog, label: 'Message log' },
        setvclog: { fn: storage.setVcLog, label: 'Voice log' },
        setmodlog: { fn: storage.setModLog, label: 'Mod log' },
        setlevellog: { fn: storage.setLevelLog, label: 'Level log' }
      };

      if (setters[sub]) {
        const channel = interaction.options.getChannel('channel');
        setters[sub].fn(guildId, channel.id);
        let extra = '';
        if (sub === 'setlevellog') {
          extra =
            '\n⚠️ Note: this bot doesn\'t currently have a leveling/XP system, so nothing will post here yet — let me know if you want that built.';
        }
        return interaction.reply(`📋 **${setters[sub].label}** will now be sent to ${channel}.${extra}`);
      }

      if (sub === 'status') {
        const logs = storage.getLogsConfig(guildId);
        const line = (id) => (id ? `<#${id}>` : 'Not set');
        return interaction.reply({
          content:
            `**Logging Channels**\n` +
            `Channel log: ${line(logs.channelLogId)}\n` +
            `Guild log: ${line(logs.guildLogId)}\n` +
            `Message log: ${line(logs.msgLogId)}\n` +
            `Voice log: ${line(logs.vcLogId)}\n` +
            `Mod log: ${line(logs.modLogId)}\n` +
            `Level log: ${line(logs.levelLogId)}`,
          ephemeral: true
        });
      }
    }
  }
];
