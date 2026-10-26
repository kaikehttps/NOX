import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { isVoiceLive, useVoice, useVoiceSnapshot, VOICE_STATE_LABEL } from '../providers/VoiceProvider';
import { colors, hairline, space } from '../theme';
import { IconButton } from './Button';
import { Txt } from './Txt';

/** Barra de chamada minimizada: fica acima das abas enquanto houver voz ativa. */
export const CallBar = memo(function CallBar() {
  const router = useRouter();
  const { target, leave, toggleMute } = useVoice();
  const snap = useVoiceSnapshot();
  const live = isVoiceLive(snap);
  if (!live && snap.state !== 'failed') return null;

  const speaking = snap.participants.some((p) => p.isSpeaking);
  const stateColor = snap.state === 'connected' ? colors.accent : snap.state === 'failed' ? colors.danger : colors.warning;

  return (
    <Pressable
      onPress={() => router.push('/voice')}
      accessibilityRole="button"
      accessibilityLabel={`Chamada: ${target?.label ?? 'voz'}, ${VOICE_STATE_LABEL[snap.state]}. Abrir.`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2],
        paddingLeft: space[3],
        paddingRight: space[1],
        height: 52,
        backgroundColor: colors.surface,
        borderTopWidth: hairline,
        borderTopColor: colors.border,
      }}
    >
      {/* Sinal: barra vertical que acende quando alguém fala. */}
      <View style={{ width: 3, height: 24, backgroundColor: speaking ? colors.accent : colors.borderStrong }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="bodyStrong" numberOfLines={1}>
          {target?.label ?? 'Chamada de voz'}
        </Txt>
        <Txt variant="micro" color={stateColor} numberOfLines={1}>
          {VOICE_STATE_LABEL[snap.state].toUpperCase()}
          {snap.state === 'connected' ? ` · ${snap.participants.length} NA SALA` : ''}
        </Txt>
      </View>
      {live ? (
        <IconButton
          icon={snap.muted ? 'micOff' : 'mic'}
          label={snap.muted ? 'Ativar microfone' : 'Silenciar microfone'}
          onPress={() => void toggleMute()}
          color={snap.muted ? colors.danger : colors.text}
        />
      ) : null}
      <IconButton icon={live ? 'leave' : 'close'} label={live ? 'Sair da chamada' : 'Dispensar'} onPress={() => void leave()} color={colors.danger} />
    </Pressable>
  );
});
