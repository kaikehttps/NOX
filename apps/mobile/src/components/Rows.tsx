import { memo, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { usePresence, useProfile } from '@nox/firebase/react';
import { nameOf } from '../lib/format';
import { useNox } from '../providers/NoxProvider';
import { colors, space } from '../theme';
import { Avatar } from './Avatar';
import { Txt } from './Txt';

interface UserRowProps {
  uid: string;
  /** Linha secundária; padrão: @username. */
  subtitle?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  showPresence?: boolean;
}

/** Linha de usuário com avatar chanfrado, nome, @username e presença. */
export const UserRow = memo(function UserRow({ uid, subtitle, right, onPress, onLongPress, showPresence = true }: UserRowProps) {
  const client = useNox();
  const profile = useProfile(client, uid);
  const presence = usePresence(client, showPresence ? uid : null);
  const name = nameOf(profile);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress && !onLongPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingHorizontal: space[4],
        paddingVertical: space[2] + 2,
        backgroundColor: pressed ? colors.surface : 'transparent',
      })}
    >
      <Avatar seed={uid} name={name} url={profile?.avatarUrl} size={38} status={showPresence ? (presence?.state ?? 'offline') : undefined} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="bodyStrong" numberOfLines={1}>
          {name}
        </Txt>
        {subtitle === undefined ? (
          <Txt variant="mono" numberOfLines={1}>
            {profile?.username ? `@${profile.username}` : ' '}
          </Txt>
        ) : typeof subtitle === 'string' ? (
          <Txt variant="small" numberOfLines={1}>
            {subtitle}
          </Txt>
        ) : (
          subtitle
        )}
      </View>
      {right ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>{right}</View> : null}
    </Pressable>
  );
});
