import { memo, useEffect, useState } from 'react';
import { FlatList, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProfile } from '@nox/firebase/react';
import type { VoiceParticipant } from '@nox/realtime';
import { Avatar } from '../src/components/Avatar';
import { Button, IconButton } from '../src/components/Button';
import { EmptyState, InlineError } from '../src/components/Feedback';
import { Icon } from '../src/components/Icon';
import { Logo } from '../src/components/Logo';
import { Txt } from '../src/components/Txt';
import { duration } from '../src/lib/format';
import { useNox } from '../src/providers/NoxProvider';
import { isVoiceLive, useVoice, useVoiceSnapshot, VOICE_STATE_LABEL } from '../src/providers/VoiceProvider';
import { colors, hairline, space } from '../src/theme';

export default function VoiceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { target, join, leave, toggleMute, toggleDeafen } = useVoice();
  const snap = useVoiceSnapshot();
  const live = isVoiceLive(snap);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/conversas'));

  const columns = width > 600 ? 4 : 3;
  const cell = Math.floor((width - space[4] * 2 - space[3] * (columns - 1)) / columns);

  const stateColor =
    snap.state === 'connected' ? colors.accent : snap.state === 'failed' ? colors.danger : snap.state === 'idle' || snap.state === 'disconnected' ? colors.textFaint : colors.warning;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      {/* topo */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[2], height: 52, gap: space[2] }}>
        <IconButton icon="back" label="Minimizar chamada" onPress={close} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="title" numberOfLines={1}>
            {target?.label ?? 'Voz'}
          </Txt>
          {target?.context ? (
            <Txt variant="micro" numberOfLines={1}>
              {target.context.toUpperCase()}
            </Txt>
          ) : null}
        </View>
        <Logo size={20} signalColor={snap.participants.some((p) => p.isSpeaking) ? colors.accent : colors.borderStrong} />
        <View style={{ width: space[2] }} />
      </View>

      {/* estado da conexão */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[2],
          marginHorizontal: space[4],
          paddingVertical: space[2],
          borderTopWidth: hairline,
          borderBottomWidth: hairline,
          borderColor: colors.border,
        }}
      >
        <View style={{ width: 8, height: 8, backgroundColor: stateColor }} />
        <Txt variant="label" color={stateColor} style={{ flex: 1 }}>
          {VOICE_STATE_LABEL[snap.state]}
          {snap.state === 'reconnecting' && snap.reconnectAttempt > 0 ? ` · tentativa ${snap.reconnectAttempt}` : ''}
        </Txt>
        {snap.state === 'connected' && snap.connectedAt ? <Elapsed since={snap.connectedAt} /> : null}
      </View>

      {snap.error ? <InlineError message={snap.error} style={{ marginHorizontal: space[4], marginTop: space[3] }} /> : null}

      {!live && snap.state !== 'failed' ? (
        <View style={{ flex: 1 }}>
          <EmptyState code="// sem chamada" text="Nenhuma chamada ativa. Entre em um canal de voz ou ligue para alguém em uma conversa." />
        </View>
      ) : (
        <FlatList
          data={snap.participants}
          key={columns}
          numColumns={columns}
          keyExtractor={(p) => p.identity}
          contentContainerStyle={{ padding: space[4], gap: space[4] }}
          columnWrapperStyle={{ gap: space[3] }}
          renderItem={({ item }) => <ParticipantTile participant={item} size={cell} />}
          ListEmptyComponent={
            snap.state === 'failed' ? undefined : (
              <Txt variant="mono" style={{ textAlign: 'center', paddingTop: space[8] }}>
                {snap.state === 'connected' ? 'Só você aqui por enquanto.' : 'Abrindo o canal de voz…'}
              </Txt>
            )
          }
        />
      )}

      {/* controles */}
      <View
        style={{
          borderTopWidth: hairline,
          borderTopColor: colors.border,
          backgroundColor: colors.nav,
          paddingTop: space[4],
          paddingBottom: insets.bottom + space[4],
          paddingHorizontal: space[4],
        }}
      >
        {live ? (
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space[5] }}>
            <Control
              icon={snap.muted ? 'micOff' : 'mic'}
              label={snap.muted ? 'mudo' : 'microfone'}
              active={!snap.muted}
              danger={snap.muted}
              onPress={() => void toggleMute()}
            />
            <Control
              icon={snap.deafened ? 'headphonesOff' : 'headphones'}
              label={snap.deafened ? 'surdo' : 'áudio'}
              active={!snap.deafened}
              danger={snap.deafened}
              onPress={() => void toggleDeafen()}
            />
            <Control
              icon="leave"
              label="sair"
              danger
              onPress={() => {
                void leave();
                close();
              }}
            />
          </View>
        ) : snap.state === 'failed' && target ? (
          <View style={{ gap: space[3] }}>
            <Button label="Tentar novamente" variant="primary" icon="refresh" onPress={() => void join(target)} />
            <Button label="Fechar" variant="ghost" onPress={() => void leave().then(close)} />
          </View>
        ) : (
          <Button label="Fechar" onPress={close} />
        )}
      </View>
    </View>
  );
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <Txt variant="mono">{duration(now - since)}</Txt>;
}

function Control({
  icon,
  label,
  onPress,
  active,
  danger,
}: {
  icon: 'mic' | 'micOff' | 'headphones' | 'headphonesOff' | 'leave';
  label: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <View style={{ alignItems: 'center', gap: space[1] + 2 }}>
      <IconButton
        icon={icon}
        label={label}
        onPress={onPress}
        bordered
        danger={danger}
        active={active && !danger}
        size={24}
        style={{ width: 60, height: 60 }}
        color={danger ? colors.danger : colors.text}
      />
      <Txt variant="micro" color={danger ? colors.danger : colors.textMuted}>
        {label.toUpperCase()}
      </Txt>
    </View>
  );
}

const ParticipantTile = memo(function ParticipantTile({ participant: p, size }: { participant: VoiceParticipant; size: number }) {
  const client = useNox();
  // A identidade LiveKit é o uid do Firebase: o perfil traz nome e avatar atuais.
  const profile = useProfile(client, p.identity);
  const name = profile?.displayName ?? p.name;
  const avatar = Math.min(size - space[2], 84);
  return (
    <View style={{ width: size, alignItems: 'center', gap: space[2] }} accessibilityLabel={`${name}${p.isSpeaking ? ', falando' : ''}${p.micEnabled ? '' : ', mudo'}`}>
      <Avatar seed={p.identity} name={name} url={profile?.avatarUrl} size={avatar} speaking={p.isSpeaking} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: size }}>
        {!p.micEnabled ? <Icon name="micOff" size={12} color={colors.danger} /> : null}
        <Txt variant="small" color={p.isSpeaking ? colors.text : colors.textMuted} numberOfLines={1} style={{ flexShrink: 1 }}>
          {p.isLocal ? `${name} (você)` : name}
        </Txt>
      </View>
      {p.quality === 'poor' || p.quality === 'lost' ? (
        <Txt variant="micro" color={colors.warning}>
          {p.quality === 'lost' ? 'SEM SINAL' : 'SINAL FRACO'}
        </Txt>
      ) : null}
    </View>
  );
});
