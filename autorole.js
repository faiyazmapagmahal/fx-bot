const storage = require('./storage');

function registerAutoRoleListener(client) {
  client.on('guildMemberAdd', async (member) => {
    const roleId = storage.getAutoRole(member.guild.id);
    if (!roleId) return;
    const role = member.guild.roles.cache.get(roleId);
    if (!role) return;
    if (!role.editable) {
      console.warn(`Autorole "${role.name}" is above my highest role in ${member.guild.name}.`);
      return;
    }
    await member.roles.add(role).catch((err) => {
      console.error(`Failed to apply autorole in ${member.guild.name}:`, err.message);
    });
  });
}

module.exports = { registerAutoRoleListener };
