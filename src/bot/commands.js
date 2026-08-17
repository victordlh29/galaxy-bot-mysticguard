const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const player = require('../music/PlayerManager');
const { getConfig } = require('../utils/config');
const { logCommand } = require('../utils/logger');
const { getMember } = require('../utils/xp');
const { buildRulesEmbed } = require('../utils/rulesEmbed');
const { isAdmin, isSuperAdmin, isGuildOwner, detectAdminRoles, canControlMusic } = require('../utils/permissions');

const commandDefs = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Reproduce una canción o playlist (nombre o URL)')
    .addStringOption((o) => o.setName('query').setDescription('Nombre de la canción o URL de YouTube').setRequired(true)),
  new SlashCommandBuilder().setName('skip').setDescription('Salta a la siguiente canción'),
  new SlashCommandBuilder().setName('stop').setDescription('Detiene la música y sale del canal'),
  new SlashCommandBuilder().setName('pause').setDescription('Pausa la reproducción'),
  new SlashCommandBuilder().setName('resume').setDescription('Reanuda la reproducción'),
  new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Ajusta el volumen')
    .addIntegerOption((o) => o.setName('nivel').setDescription('Volumen 0-100').setRequired(true).setMinValue(0).setMaxValue(100)),
  new SlashCommandBuilder().setName('queue').setDescription('Muestra la cola de reproducción'),
  new SlashCommandBuilder().setName('nowplaying').setDescription('Muestra la canción actual'),
  new SlashCommandBuilder().setName('loop').setDescription('Activa/desactiva el bucle de la cola'),
  new SlashCommandBuilder().setName('autoplay').setDescription('Activa/desactiva el autoplay de canciones relacionadas'),
  new SlashCommandBuilder()
    .setName('filter')
    .setDescription('Aplica un filtro de audio')
    .addStringOption((o) =>
      o.setName('filtro')
        .setDescription('Filtro a aplicar')
        .setRequired(true)
        .addChoices(
          { name: 'Apagar filtros', value: 'off' },
          { name: 'Bassboost', value: 'bassboost' },
          { name: 'Bassboost Lite', value: 'bassboost-lite' },
          { name: '8D', value: '8d' },
          { name: 'Nightcore', value: 'nightcore' },
          { name: 'Vaporwave', value: 'vaporwave' },
          { name: 'Karaoke', value: 'karaoke' }
        )
    ),
  new SlashCommandBuilder().setName('level').setDescription('Muestra tu nivel y XP actual'),
  new SlashCommandBuilder().setName('leaderboard').setDescription('Muestra el top 10 del servidor'),
  new SlashCommandBuilder()
    .setName('activity')
    .setDescription('Envía el enlace de la actividad (dashboard dentro de Discord)'),
  new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Muestra tu avatar, el de otro usuario o genera uno aleatorio')
    .addUserOption((o) => o.setName('usuario').setDescription('Usuario del que ver el avatar (vacío = el tuyo)'))
    .addBooleanOption((o) => o.setName('aleatorio').setDescription('Genera un avatar aleatorio (DiceBear)')),
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configura el canal de reglas con el mensaje de reacción (solo admin)'),
  new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Configura los roles que cuentan como administrador (solo el dueño del servidor)')
    .addSubcommand((s) =>
      s
        .setName('add')
        .setDescription('Añade un rol como administrador del servidor')
        .addRoleOption((o) => o.setName('rol').setDescription('El rol a añadir').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('remove')
        .setDescription('Quita un rol de la lista de administradores')
        .addRoleOption((o) => o.setName('rol').setDescription('El rol a quitar').setRequired(true))
    )
    .addSubcommand((s) => s.setName('list').setDescription('Muestra los roles administradores configurados'))
    .addSubcommand((s) =>
      s.setName('detect').setDescription('Detecta y configura automáticamente los roles con permisos de administrador')
    )
];

function formatDuration(sec) {
  if (!sec) return '?';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

async function handleCommand(interaction) {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, guild, member } = interaction;
  const config = await getConfig(guild.id);
  await interaction.deferReply().catch(() => {});

  const summary = interaction.options.data
    .map((o) => `${o.name}: ${Array.isArray(o.value) ? o.value.length + ' items' : o.value}`)
    .join(', ');
  await logCommand(guild.id, {
    type: 'command',
    command: '/' + commandName,
    userId: interaction.user.id,
    userTag: interaction.user.tag,
    details: summary || ''
  });

  try {
    let embed;
    const musicControlCmds = ['play', 'skip', 'stop', 'pause', 'resume', 'volume', 'loop', 'autoplay', 'filter', 'queue', 'nowplaying'];
    if (musicControlCmds.includes(commandName) && !canControlMusic(member, config)) {
      return interaction.editReply('Solo el rol de control de música (sonidistas) o un administrador puede usar este comando.');
    }
    switch (commandName) {
      case 'play': {
        if (!config.music.enabled) return interaction.editReply('La música está desactivada en este servidor.');
        if (config.music.commandChannelId && interaction.channelId !== config.music.commandChannelId) {
          return interaction.editReply('Usa el canal de música configurado para este comando.');
        }
        if (!member.voice.channel) return interaction.editReply('Entra a un canal de voz primero.');
        const query = interaction.options.getString('query');
        const tracks = await player.resolveQuery(query);
        if (!tracks.length) return interaction.editReply('No encontré resultados para esa búsqueda.');
        player.getQueue(guild.id, typeof config.music.volume === 'number' ? config.music.volume : 40, Array.isArray(config.music.eq) && config.music.eq.length === 10 ? [...config.music.eq] : null).textChannel = interaction.channel;
        const startPos = player.getQueue(guild.id).tracks.length;
        await player.play(guild.id, member.voice.channel, tracks[0]);
        if (tracks.length > 1) {
          const q2 = player.getQueue(guild.id);
          for (let i = 1; i < tracks.length; i++) q2.tracks.push(tracks[i]);
        }
        const q = player.getQueue(guild.id);
        const msg =
          tracks.length > 1
            ? `Añadidas **${tracks.length} canciones** a la cola (posición ${startPos + 1})`
            : `▶️ **${tracks[0].title}** añadida a la cola (posición ${startPos + 1})`;
        embed = new EmbedBuilder().setColor('#5865F2').setDescription(msg);
        return interaction.editReply({ embeds: [embed] });
      }
      case 'skip': {
        const skipped = player.skip(guild.id);
        embed = new EmbedBuilder().setColor('#3B82F6').setDescription(skipped ? `⏭️ Saltada **${skipped.title}**` : 'Nada que saltar.');
        return interaction.editReply({ embeds: [embed] });
      }
      case 'stop': {
        player.stop(guild.id);
        return interaction.editReply('⏹️ Música detenida y salí del canal.');
      }
      case 'pause':
        return interaction.editReply(player.pause(guild.id) ? '⏸️ Pausada.' : 'Nada reproduciéndose.');
      case 'resume':
        return interaction.editReply(player.resume(guild.id) ? '▶️ Reanudada.' : 'Nada pausado.');
      case 'volume': {
        const vol = player.setVolume(guild.id, interaction.options.getInteger('nivel'));
        await config.updateOne({ $set: { 'music.volume': vol } }).catch(() => {});
        return interaction.editReply(`🔊 Volumen ajustado a **${vol}%**.`);
      }
      case 'queue': {
        const q = player.getQueue(guild.id);
        if (!q.tracks.length && !q.current) return interaction.editReply('La cola está vacía.');
        const lines = [];
        if (q.current) lines.push(`**Reproduciendo:** ${q.current.title}`);
        q.tracks.slice(0, 10).forEach((t, i) => lines.push(`\`${i + 1}.\` ${t.title} \`${formatDuration(t.duration)}\``));
        if (q.tracks.length > 10) lines.push(`...y ${q.tracks.length - 10} más`);
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor('#23A55A').setTitle('Cola de reproducción').setDescription(lines.join('\n'))] });
      }
      case 'nowplaying': {
        const now = player.nowPlaying(guild.id);
        return interaction.editReply(now ? `🎵 **${now.title}**` : 'No hay nada reproduciéndose.');
      }
      case 'loop': {
        const looping = player.toggleLoop(guild.id);
        return interaction.editReply(looping ? '🔁 Bucle activado.' : '🔂 Bucle desactivado.');
      }
      case 'autoplay': {
        const auto = player.toggleAutoplay(guild.id);
        return interaction.editReply(auto ? '📻 Autoplay activado (reproducirá canciones relacionadas al terminar).' : '📻 Autoplay desactivado.');
      }
      case 'filter': {
        const f = interaction.options.getString('filtro');
        player.setFilter(guild.id, f);
        return interaction.editReply(f === 'off' ? '🎚️ Filtros apagados.' : `🎚️ Filtro **${f}** aplicado.`);
      }
      case 'level': {
        const m = await getMember(guild.id, interaction.user.id);
        const { level, needed } = require('../utils/xp').levelForXp(m.xp);
        embed = new EmbedBuilder()
          .setColor('#9BA3F5')
          .setTitle('Nivel')
          .setDescription(`**${interaction.user.username}**\nNivel: **${level}**\nXP: **${m.xp}**\nSiguiente nivel en: **${needed} XP**\nMinutos en voz: **${m.voiceMinutes}**`);
        return interaction.editReply({ embeds: [embed] });
      }
      case 'leaderboard': {
        const top = await require('../models/Member').find({ guildId: guild.id }).sort({ xp: -1 }).limit(10);
        if (!top.length) return interaction.editReply('Todavía no hay XP registrada.');
        const lines = top.map((m, i) => `\`${i + 1}.\` <@${m.userId}> — **${m.xp} XP** (nivel ${m.level})`);
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor('#F2C94C').setTitle('🏆 Top 10 del servidor').setDescription(lines.join('\n'))] });
      }
      case 'activity': {
        const url = process.env.PUBLIC_URL || process.env.DASHBOARD_URL || 'http://localhost:3000';
        embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('🎮 Actividad Galaxy')
          .setDescription(`Abre la actividad **GALAXY BOT** desde el menú de actividades del servidor para usar el dashboard dentro de Discord.\nEnlace: ${url}/activity`);
        return interaction.editReply({ embeds: [embed] });
      }
      case 'avatar': {
        const random = interaction.options.getBoolean('aleatorio');
        const target = interaction.options.getUser('usuario') || interaction.user;
        if (random) {
          const styles = ['adventurer', 'avataaars', 'bottts', 'fun-emoji', 'identicon', 'lorelei', 'micah', 'miniavs', 'notionists', 'open-peeps', 'personas', 'pixel-art', 'big-ears', 'big-smile', 'croodles', 'dylan', 'thumbs'];
          const style = styles[Math.floor(Math.random() * styles.length)];
          const seed = Math.random().toString(36).slice(2, 10);
          embed = new EmbedBuilder()
            .setColor('#9BA3F5')
            .setTitle('🎨 Avatar aleatorio')
            .setDescription(`Estilo **${style}** · semilla \`${seed}\``)
            .setImage(`https://api.dicebear.com/9.x/${style}/png?seed=${seed}&size=256`)
            .setFooter({ text: 'Generado con DiceBear' });
          return interaction.editReply({ embeds: [embed] });
        }
        const avatar = target.displayAvatarURL({ size: 1024, extension: 'png' });
        embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle(`🖼️ Avatar de ${target.username}`)
          .setImage(avatar)
          .setFooter({ text: `ID: ${target.id}` });
        return interaction.editReply({ embeds: [embed] });
      }
      case 'setup': {
        const isAdminUser = isAdmin(member, config);
        if (!isAdminUser) return interaction.editReply('Solo el dueño o un administrador puede ejecutar este comando.');
        const channel = interaction.channel;
        if (!channel || !channel.isTextBased()) return interaction.editReply('Ejecuta esto en un canal de texto.');
        const text = config.rules.text || '';
        const msg = await channel.send({ embeds: [buildRulesEmbed(text, { guild })] });
        await msg.react(config.rules.emoji || '✅');
        await config.updateOne({
          $set: { 'rules.channelId': channel.id, 'rules.messageId': msg.id, 'rules.enabled': true }
        });
        embed = new EmbedBuilder()
          .setColor('#23A55A')
          .setDescription(`✅ Mensaje de reglas creado en ${channel}. Crea el rol **Hoobits** en el dashboard (Reglas → "Crear rol de acceso"): quien reaccione ✅ obtiene la llave de acceso a los canales (puerta de entrada, independiente de los rangos de XP).`);
        return interaction.editReply({ embeds: [embed] });
      }
      case 'admin': {
        const sub = interaction.options.getSubcommand();
        const canConfigure =
          isSuperAdmin(interaction.user.id) ||
          isGuildOwner(member) ||
          member.permissions.has('Administrator');
        if (!canConfigure) {
          return interaction.editReply('Solo el **dueño del servidor** puede configurar los roles de administrador.');
        }
        if (sub === 'add' || sub === 'remove') {
          const role = interaction.options.getRole('rol');
          if (!role) return interaction.editReply('Rol inválido.');
          const current = Array.isArray(config.adminRoles) ? config.adminRoles : [];
          const set = new Set(current);
          if (sub === 'add') {
            if (set.has(role.id)) return interaction.editReply(`El rol **${role.name}** ya es administrador.`);
            set.add(role.id);
          } else {
            if (!set.has(role.id)) return interaction.editReply(`El rol **${role.name}** no está en la lista de administradores.`);
            set.delete(role.id);
          }
          await config.updateOne({ $set: { adminRoles: [...set] } });
          config.adminRoles = [...set];
          embed = new EmbedBuilder()
            .setColor(sub === 'add' ? '#23A55A' : '#F23F43')
            .setDescription(
              sub === 'add'
                ? `✅ **${role.name}** ahora cuenta como administrador del servidor.`
                : `🗑️ **${role.name}** ya no cuenta como administrador.`
            );
          return interaction.editReply({ embeds: [embed] });
        }
        if (sub === 'detect') {
          const detected = detectAdminRoles(guild);
          await config.updateOne({ $set: { adminRoles: detected } });
          config.adminRoles = detected;
          embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('Detector de roles administradores')
            .setDescription(
              detected.length
                ? `Detectados **${detected.length} rol(es)** con permisos de administrador o nombre de admin:\n` +
                  detected.map((id) => `• ${guild.roles.cache.get(id)?.name || id} (\`${id}\`)`).join('\n')
                : 'No encontré roles con permisos de administrador ni nombres de admin.'
            );
          return interaction.editReply({ embeds: [embed] });
        }
        const rolesList = (Array.isArray(config.adminRoles) ? config.adminRoles : [])
          .map((id) => `• ${guild.roles.cache.get(id)?.name || 'rol desaparecido'} (\`${id}\`)`)
          .join('\n');
        embed = new EmbedBuilder()
          .setColor('#9BA3F5')
          .setTitle('Roles administradores')
          .setDescription(
            `👑 **Dueño del servidor:** <@${guild.ownerId}>\n\n` +
              (rolesList
                ? `**Roles con poder de admin:**\n${rolesList}\n\nUsa \`/admin add\`, \`/admin remove\` o \`/admin detect\` para cambiarlos.`
                : 'Sin roles admin configurados. Usa `/admin add` o `/admin detect`.')
          );
        return interaction.editReply({ embeds: [embed] });
      }
      default:
        return interaction.editReply('Comando desconocido.');
    }
  } catch (err) {
    console.error(`[CMD] error en ${commandName}:`, err.message);
    return interaction.editReply('Ocurrió un error ejecutando el comando.').catch(() => {});
  }
}

module.exports = { commandDefs, handleCommand };
