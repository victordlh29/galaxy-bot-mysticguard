const { EmbedBuilder } = require('discord.js');

const DEFAULT_RULES_TEXT = `📋 **Reglas del Servidor**
¡Bienvenido al servidor! Para mantener un ambiente agradable, por favor sigue estas reglas:

1. 🤝 **Respeto mutuo**
Trata a todos los miembros con respeto. No se tolera el acoso, bullying o discriminación de ningún tipo.

2. 💬 **Contenido apropiado**
Mantén las conversaciones en los canales adecuados. No publiques contenido NSFW, spam o ilegal.

3. 🎭 **No impersonar**
No te hagas pasar por otros usuarios, moderadores o el equipo administrativo.

4. 📢 **No spam**
Evita enviar mensajes repetitivos, flooding o publicidad no autorizada.

5. 🎵 **Uso responsable de música**
Usa los comandos de música en los canales designados y respeta el volumen.

6. 🛡️ **Acceso al servidor**
Para obtener acceso a todos los canales, reacciona con ✅ abajo.

7. ⚠️ **Sanciones**
El incumplimiento de estas reglas resultará en advertencias, silenciamiento o expulsión.

Al reaccionar con ✅ confirmas que has leído y aceptas las reglas del servidor.`;

const OLD_RULES_TEXT = `📜 **Reglas del Servidor**
¡Bienvenido al servidor! Para mantener un ambiente agradable, por favor sigue estas reglas:

🤝 **Respeto mutuo**
Trata a todos los miembros con respeto. No se tolera el acoso, bullying o discriminación de ningún tipo.

💬 **Contenido apropiado**
Mantén las conversaciones en los canales adecuados. No publiques contenido NSFW, spam o ilegal.

🎭 **No impersonar**
No te hagas pasar por otros usuarios, moderadores o el equipo administrativo.

📢 **No spam**
Evita enviar mensajes repetitivos, flooding o publicidad no autorizada.

🎵 **Uso responsable de música**
Usa los comandos de música en los canales designados y respeta el volumen.

🛡️ **Acceso al servidor**
Para obtener acceso a todos los canales, reacciona con ✅ abajo.

⚠️ **Sanciones**
El incumplimiento de estas reglas resultará en advertencias, silenciamiento o expulsión.

Al reaccionar con ✅ confirmas que has leído y aceptas las reglas del servidor.`;

function buildRulesEmbed(text, { guild } = {}) {
  const clean = (s) => s.replace(/\*\*/g, '').trim();
  const lines = (text || DEFAULT_RULES_TEXT)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const title = clean(lines.shift()) || 'Reglas del Servidor';

  const desc = [];
  let i = 0;
  while (i < lines.length && !/^\d+\.\s/.test(lines[i])) desc.push(lines[i++]);

  const fields = [];
  while (i < lines.length) {
    if (!/^\d+\.\s/.test(lines[i])) {
      i++;
      continue;
    }
    const name = clean(lines[i]);
    const value = [];
    i++;
    while (i < lines.length && !/^\d+\.\s/.test(lines[i])) value.push(lines[i++]);
    fields.push({ name, value: value.join('\n') || '—' });
  }

  const last = fields[fields.length - 1];
  if (last) {
    const paras = last.value.split('\n');
    const lastPara = paras.pop().trim();
    if (lastPara && !/^\d+\.\s/.test(lastPara)) {
      last.value = [...paras, `> ${lastPara}`].join('\n') || `> ${lastPara}`;
    }
  }

  const avatar = guild?.client?.user?.displayAvatarURL({ size: 64 });

  // Fecha/hora con el sello nativo de Discord (se renderiza en la zona horaria de quien
  // lee). Formatearla con la TZ del proceso daba una hora distinta a la del mensaje cuando
  // el bot corre en un host con otra zona (el hosting va en UTC).
  return new EmbedBuilder()
    .setColor('#5B21B6')
    .setAuthor({ name: guild ? `MysticGuard · ${guild.name}` : 'MysticGuard', iconURL: avatar })
    .setTitle(title)
    .setDescription(desc.join('\n'))
    .addFields(fields.map((f) => ({ name: f.name, value: f.value })))
    .setFooter({ text: 'MysticGuard - Reglas del Servidor', iconURL: avatar })
    .setTimestamp(new Date());
}

module.exports = { DEFAULT_RULES_TEXT, OLD_RULES_TEXT, buildRulesEmbed };
