const { getConfig } = require('../../utils/config');
const { logCommand } = require('../../utils/logger');
const { createDedupe } = require('../../utils/dedupe');

// La despedida se duplica por el MISMO motivo que la bienvenida: Discord REENVÍA
// guildMemberRemove al retomar la sesión (RESUME) tras un corte de red. Misma guarda.
//
// Discriminador: `joinedTimestamp`, que cambia si el miembro se vuelve a unir de verdad
// (así un ciclo salir → reingresar → salir recibe sus dos despedidas). En un miembro NO
// cacheado (partial) ese dato puede faltar: en ese caso leaveKey() devuelve null y la util
// NO deduplica, porque es preferible una despedida de más que ninguna.
const GOODBYE_TTL_MS = 10 * 60 * 1000;
const alreadyHandled = createDedupe(GOODBYE_TTL_MS, 'GOODBYE');

function leaveKey(member) {
  const ts = member.joinedTimestamp || (member.joinedAt ? new Date(member.joinedAt).getTime() : 0);
  return ts ? `${member.guild.id}:${member.id}:${ts}` : null;
}

module.exports = {
  name: 'guildMemberRemove',
  async execute(member) {
    if (alreadyHandled(leaveKey(member))) return;

    await logCommand(member.guild.id, {
      type: 'event',
      command: 'member-leave',
      userId: member.id,
      userTag: member.user.tag,
      details: 'Salió del servidor'
    });

    const config = await getConfig(member.guild.id);
    if (config.goodbye && config.goodbye.enabled && config.goodbye.channelId) {
      const channel = member.guild.channels.cache.get(config.goodbye.channelId);
      if (channel && channel.isTextBased()) {
        const msg = config.goodbye.message
          .replaceAll('{user}', member.user.username)
          .replaceAll('{server}', member.guild.name);
        channel.send(msg).catch(() => {});
      }
    }
  },
  // Expuesto para test/diagnóstico.
  _alreadyHandled: (member) => alreadyHandled(leaveKey(member))
};
