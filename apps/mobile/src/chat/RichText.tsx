import { memo, useMemo } from 'react';
import { Linking, Text } from 'react-native';
import { useProfile } from '@nox/firebase/react';
import { isSafeUrl, tokenize } from '@nox/shared';
import { useNox } from '../providers/NoxProvider';
import { colors, fonts, type } from '../theme';

interface Props {
  text: string;
  myUid: string;
  onLinkError?: () => void;
}

/** Texto de mensagem seguro: links http(s) clicáveis e menções `<@uid>` como @nome. */
export const RichText = memo(function RichText({ text, myUid, onLinkError }: Props) {
  const tokens = useMemo(() => tokenize(text), [text]);
  return (
    <Text style={type.body} selectable={false}>
      {tokens.map((t, i) => {
        if (t.type === 'text') return t.value;
        if (t.type === 'link')
          return (
            <Text
              key={i}
              style={{ color: colors.accentSoft, textDecorationLine: 'underline' }}
              accessibilityRole="link"
              onPress={() => {
                if (!isSafeUrl(t.href)) return;
                Linking.openURL(t.href).catch(() => onLinkError?.());
              }}
            >
              {t.href}
            </Text>
          );
        return <Mention key={i} uid={t.uid} self={t.uid === myUid} />;
      })}
    </Text>
  );
});

function Mention({ uid, self }: { uid: string; self: boolean }) {
  const client = useNox();
  const profile = useProfile(client, uid);
  const label = profile === null ? 'conta removida' : (profile?.displayName ?? '…');
  return (
    <Text style={{ fontFamily: fonts.sansMedium, color: colors.accent, backgroundColor: self ? colors.accentTint : 'transparent' }}>
      @{label}
    </Text>
  );
}
