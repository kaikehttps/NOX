import { Pressable, View } from 'react-native';
import type { MessageView } from '@nox/firebase';
import { Icon } from '../components/Icon';
import { Sheet, SheetItem } from '../components/Layout';
import { Txt } from '../components/Txt';
import { colors, hairline, space } from '../theme';

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'] as const;

interface Props {
  message: MessageView | null;
  myUid: string;
  canSend: boolean;
  canModerate: boolean;
  onClose: () => void;
  onReact: (m: MessageView, emoji: string, active: boolean) => void;
  onReply: (m: MessageView) => void;
  onCopy: (m: MessageView) => void;
  onEdit: (m: MessageView) => void;
  onDelete: (m: MessageView) => void;
}

/** Menu de toque longo: reações rápidas + ações sobre a mensagem. */
export function MessageMenu({ message, myUid, canSend, canModerate, onClose, onReact, onReply, onCopy, onEdit, onDelete }: Props) {
  const m = message;
  const mine = m?.authorId === myUid;
  const confirmed = m ? !m.pending : false;
  const run = (fn: (m: MessageView) => void) => () => {
    if (!m) return;
    onClose();
    fn(m);
  };
  return (
    <Sheet visible={m !== null} onClose={onClose} title="mensagem">
      {m ? (
        <View>
          {confirmed ? (
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingHorizontal: space[4],
                paddingVertical: space[2],
                borderBottomWidth: hairline,
                borderBottomColor: colors.border,
              }}
            >
              {QUICK_REACTIONS.map((emoji) => {
                const active = Boolean(m.reactions[emoji]?.[myUid]);
                return (
                  <Pressable
                    key={emoji}
                    onPress={run((x) => onReact(x, emoji, active))}
                    accessibilityRole="button"
                    accessibilityLabel={`Reagir com ${emoji}`}
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => ({
                      width: 46,
                      height: 46,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: hairline,
                      borderColor: active ? colors.accent : colors.border,
                      backgroundColor: active ? colors.accentTint : pressed ? colors.elevated : colors.surface,
                    })}
                  >
                    <Txt style={{ fontSize: 22, lineHeight: 28 }}>{emoji}</Txt>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Txt variant="micro" style={{ paddingHorizontal: space[4], paddingBottom: space[2] }}>
              AGUARDANDO CONFIRMAÇÃO DO SERVIDOR
            </Txt>
          )}
          {confirmed && canSend ? <SheetItem label="Responder" icon={<Icon name="reply" size={18} />} onPress={run(onReply)} /> : null}
          <SheetItem label="Copiar texto" icon={<Icon name="copy" size={18} />} onPress={run(onCopy)} />
          {confirmed && mine && canSend ? <SheetItem label="Editar" icon={<Icon name="edit" size={18} />} onPress={run(onEdit)} /> : null}
          {confirmed && (mine || canModerate) ? (
            <SheetItem label="Apagar" danger icon={<Icon name="trash" size={18} color={colors.danger} />} onPress={run(onDelete)} />
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}
