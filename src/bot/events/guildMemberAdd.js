const { getConfig } = require('../../utils/config');
const { safeAddRole } = require('../../utils/roles');
const { logCommand } = require('../../utils/logger');

// La bienvenida salía DOS veces "a veces". El envío está en un único sitio, así que el
// duplicado viene del evento, no del código: Discord REENVÍA guildMemberAdd cuando el bot
// se reconecta y retoma la sesión (RESUME tras un corte de red — muy frecuente con el
// egress intermitente del hosting), y cada copia dispara su propio mensaje.
//
// La clave incluye `joinedTimestamp`, que cambia si el miembro se vuelve a unir de verdad:
// así un reingreso legítimo SÍ recibe su bienvenida y solo se ignora la repetición del
// MISMO ingreso. OJO: la guarda es por proceso; si el bot corre en dos instancias a la vez
// (local + hosting) cada proceso manda la suya y esto no puede evitarlo (regla: UNA
// instancia activa).
const WELCOME_TTL_MS = 10 * 60 * 1000;
const handled = new Map();

function joinKey(member) {
  const ts = member.joinedTimestamp || (member.joinedAt ? new Date(member.joinedAt).getTime() : 0);
  return `${member.guild.id}:${member.id}:${ts}`;
}

function alreadyHandled(member) {
  const now = Date.now();
  for (const [k, t] of handled) {
    if (now - t > WELCOME_TTL_MS) handled.delete(k);
  }
  const key = joinKey(member);
  const prev = handled.get(key);
  if (prev && now - prev < WELCOME_TTL_MS) return true;
  handled.set(key, now);
  return false;
}

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    if (alreadyHandled(member)) {
      console.log(`[WELCOME] evento repetido ignorado para ${member.user.tag} (${member.id}) — reconexión del gateway`);
      return;
    }

    const config = await getConfig(member.guild.id);

    if (config.welcome.enabled && config.welcome.channelId) {
      const channel = member.guild.channels.cache.get(config.welcome.channelId);
      if (channel && channel.isTextBased()) {
        const msg = config.welcome.message
          .replaceAll('{user}', `<@${member.id}>`)
          .replaceAll('{server}', member.guild.name);
        channel.send(msg).catch(() => {});
      }
    }

    let assigned = null;
    if (config.autorole.enabled) {
      assigned = await safeAddRole(
        member.guild,
        member,
        config.autorole.roleId || config.xp.gainRole,
        'Nuevo miembro: rol de bienvenida (Mago Blanco)'
      );
    }

    await logCommand(member.guild.id, {
      type: 'event',
      command: 'member-join',
      userId: member.id,
      userTag: member.user.tag,
      details: assigned ? 'Se unió y recibió su rol de bienvenida' : 'Se unió al servidor'
    });
  },
  // Expuesto para test/diagnóstico.
  _alreadyHandled: alreadyHandled
};
