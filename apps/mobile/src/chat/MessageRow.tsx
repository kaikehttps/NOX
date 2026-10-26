import { memo } from 'react';
import { Pressable, View } from 'react-native';
import type { MessageView } from '@nox/firebase';
import { useProfile } from '@nox/firebase/react';
import type { OutboxEntry } from '@nox/firebase/react';
import { formatClock } from '@nox/shared';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { Txt } from '../components/Txt';
import { nameOf } from '../lib/format';
import { useNox } from '../providers/NoxProvider';
import { colors, hairline, space } from '../theme';
import { RichText } from './RichText';

const AVATAR = 34;
const GUTTER = AVATAR + space[3];

interface RowProps {
  message: MessageView;
  grouped: boolean;
  myUid: string;
  onLongPress: (m: MessageView) => void;
  onToggleReaction: (m: MessageView, emoji: string, active: boolean) => void;
  onLinkError: () => void;
}

/** Linha de mensagem. Memoizada: só re-renderiza quando a própria mensagem muda. */
export const MessageRow = memo(function MessageRow({ message: m, grouped, myUid, onLongPress, onToggleReaction, onLinkError }: RowProps) {
  const client = useNox();
  const author = useProfile(client, m.authorId);
  const name = nameOf(author);
  const reactions = Object.entries(m.reactions).filter(([, users]) => Object.keys(users).length > 0);

  return (
    <Pressable
      onLongPress={() => onLongPress(m)}
      delayLongPress={280}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: space[3],
        paddingHorizontal: space[4],
        paddingTop: grouped ? 2 : space[3],
        paddingBottom: 2,
        backgroundColor: pressed ? colors.surface : 'transparent',
      })}
      accessibilityHint="Toque e segure para opções"
    >
      <View style={{ width: AVATAR }}>
        {grouped ? null : <Avatar seed={m.authorId} name={name} url={author?.avatarUrl} size={AVATAR} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        {grouped ? null : (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space[2], marginBottom: 1 }}>
            <Txt variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }} color={author === null ? colors.textMuted : colors.text}>
              {name}
            </Txt>
            <Txt variant="micro">{m.createdAt ? formatClock(m.createdAt) : '--:--'}</Txt>
            {m.pending ? <Icon name="clock" size={11} color={colors.textFaint} /> : null}
          </View>
        )}
        {m.replyTo ? <ReplyLine authorId={m.replyTo.authorId} preview={m.replyTo.preview} /> : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space[2] }}>
          <View style={{ flex: 1, opacity: m.pending ? 0.6 : 1 }}>
            <RichText text={m.text} myUid={myUid} onLinkError={onLinkError} />
          </View>
          {grouped && m.pending ? <Icon name="clock" size={11} color={colors.textFaint} /> : null}
        </View>
        {m.editedAt ? <Txt variant="micro">(editada)</Txt> : null}
        {reactions.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[1] + 2, marginTop: space[1] + 2 }}>
            {reactions.map(([emoji, users]) => {
              const count = Object.keys(users).length;
              const active = Boolean(users[myUid]);
              return (
                <Pressable
                  key={emoji}
                  onPress={() => onToggleReaction(m, emoji, active)}
                  accessibilityRole="button"
                  accessibilityLabel={`${emoji} ${count}${active ? ', sua reação' : ''}`}
                  accessibilityState={{ selected: active }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: space[2],
                    height: 26,
                    borderWidth: hairline,
                    borderColor: active ? colors.accent : colors.border,
                    backgroundColor: active ? colors.accentTint : colors.surface,
                  }}
                >
                  <Txt style={{ fontSize: 13 }}>{emoji}</Txt>
                  <Txt variant="mono" color={active ? colors.accent : colors.textMuted}>
                    {count}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

function ReplyLine({ authorId, preview }: { authorId: string; preview: string }) {
  const client = useNox();
  const author = useProfile(client, authorId);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] + 2, marginBottom: 2 }}>
      <View style={{ width: 2, alignSelf: 'stretch', backgroundColor: colors.borderStrong }} />
      <Icon name="reply" size={12} color={colors.textFaint} />
      <Txt variant="small" numberOfLines={1} style={{ flex: 1 }}>
        <Txt variant="small" color={colors.text}>
          {nameOf(author)}
        </Txt>
        {`  ${preview}`}
      </Txt>
    </View>
  );
}

/* ───────────── envio que falhou ───────────── */

interface FailedProps {
  entry: OutboxEntry;
  onRetry: (id: string) => void;
  onDiscard: (id: string) => void;
}

export const FailedRow = memo(function FailedRow({ entry, onRetry, onDiscard }: FailedProps) {
  return (
    <View style={{ flexDirection: 'row', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[2] }}>
      <View style={{ width: AVATAR, alignItems: 'center', paddingTop: 2 }}>
        <Icon name="alert" size={16} color={colors.danger} />
      </View>
      <View style={{ flex: 1, gap: space[1] + 2, borderLeftWidth: 2, borderLeftColor: colors.danger, paddingLeft: space[2] }}>
        <Txt variant="body" color={colors.textMuted}>
          {entry.text}
        </Txt>
        <Txt variant="micro" color={colors.danger}>
          FALHOU{entry.error ? ` · ${entry.error}` : ''}
        </Txt>
        <View style={{ flexDirection: 'row', gap: space[4] }}>
          <Pressable onPress={() => onRetry(entry.id)} accessibilityRole="button" hitSlop={8} style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
            <Icon name="refresh" size={14} color={colors.text} />
            <Txt variant="small" color={colors.text}>
              Reenviar
            </Txt>
          </Pressable>
          <Pressable onPress={() => onDiscard(entry.id)} accessibilityRole="button" hitSlop={8} style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
            <Icon name="trash" size={14} color={colors.textMuted} />
            <Txt variant="small">Descartar</Txt>
          </Pressable>
        </View>
      </View>
    </View>
  );
});

export const DayDivider = memo(function DayDivider({ label }: { label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3] }}>
      <View style={{ flex: 1, height: hairline, backgroundColor: colors.border }} />
      <Txt variant="micro">{label.toUpperCase()}</Txt>
      <View style={{ flex: 1, height: hairline, backgroundColor: colors.border }} />
    </View>
  );
});

export const MESSAGE_GUTTER = GUTTER;
