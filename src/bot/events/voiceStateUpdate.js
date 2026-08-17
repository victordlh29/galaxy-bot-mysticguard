const { getConfig } = require('../../utils/config');
const { logCommand } = require('../../utils/logger');
const { startVoiceTick, stopVoiceTick } = require('../../utils/voiceXp');

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState) {
    if (!newState.guild) return;
    const config = await getConfig(newState.guild.id);

    const guildId = newState.guild.id;
    const userId = newState.id;
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    const wasInVoice = !!oldState.channel;
    const isInVoice = !!newState.channel;
    const channelChanged = oldState.channelId !== newState.channelId;

    if (channelChanged) {
      if (!wasInVoice && isInVoice) {
        await logCommand(guildId, {
          type: 'event',
          command: 'voice-join',
          userId,
          userTag: member.user.tag,
          details: `Entró al canal ${newState.channel.name}`
        });
      } else if (wasInVoice && !isInVoice) {
        await logCommand(guildId, {
          type: 'event',
          command: 'voice-leave',
          userId,
          userTag: member.user.tag,
          details: `Salió del canal ${oldState.channel.name}`
        });
      } else if (wasInVoice && isInVoice) {
        await logCommand(guildId, {
          type: 'event',
          command: 'voice-switch',
          userId,
          userTag: member.user.tag,
          details: `Cambió de ${oldState.channel.name} a ${newState.channel.name}`
        });
      }
    } else if (!wasInVoice && !isInVoice) {
      return;
    }

    if (!config.xp.enabled || !config.xp.voiceEnabled) return;

    if (!wasInVoice && isInVoice) {
      startVoiceTick(config, newState.guild, userId);
    }

    if (wasInVoice && !isInVoice) {
      stopVoiceTick(guildId, userId);
    }
  }
};
