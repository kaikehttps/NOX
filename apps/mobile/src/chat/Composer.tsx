import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, TextInput, View, type TextInputInstance } from 'react-native';
import type { MessageView } from '@nox/firebase';
import { useProfile } from '@nox/firebase/react';
import { LIMITS } from '@nox/shared';
import { Icon } from '../components/Icon';
import { Txt } from '../components/Txt';
import { nameOf } from '../lib/format';
import { useNox } from '../providers/NoxProvider';
import { colors, fonts, fontSize, hairline, space } from '../theme';

export interface ComposerHandle {
  reply: (m: MessageView) => void;
  edit: (m: MessageView) => void;
}

interface Props {
  placeholder: string;
  /** Motivo pelo qual não é possível enviar (conversa bloqueada, sem permissão). */
  blockedReason: string | null;
  onSend: (text: string, replyTo: MessageView | null) => Promise<boolean>;
  onEdit: (m: MessageView, text: string) => Promise<boolean>;
  bottomInset: number;
}

/** Campo de mensagem com prévia de resposta/edição. */
export const Composer = forwardRef<ComposerHandle, Props>(function Composer({ placeholder, blockedReason, onSend, onEdit, bottomInset }, ref) {
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<MessageView | null>(null);
  const [editing, setEditing] = useState<MessageView | null>(null);
  const input = useRef<TextInputInstance>(null);

  useImperativeHandle(ref, () => ({
    reply: (m) => {
      setEditing(null);
      setReplyTo(m);
      input.current?.focus();
    },
    edit: (m) => {
      setReplyTo(null);
      setEditing(m);
      setText(m.text);
      input.current?.focus();
    },
  }));

  if (blockedReason) {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[2],
          paddingHorizontal: space[4],
          paddingTop: space[3],
          paddingBottom: bottomInset + space[3],
          borderTopWidth: hairline,
          borderTopColor: colors.border,
          backgroundColor: colors.nav,
        }}
      >
        <Icon name="lock" size={16} color={colors.textMuted} />
        <Txt variant="small" style={{ flex: 1 }}>
          {blockedReason}
        </Txt>
      </View>
    );
  }

  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && text.length <= LIMITS.message.textMax;

  const submit = async () => {
    if (!canSend) return;
    if (editing) {
      if (trimmed === editing.text.trim()) {
        setEditing(null);
        setText('');
        return;
      }
      const ok = await onEdit(editing, text);
      if (ok) {
        setEditing(null);
        setText('');
      }
      return;
    }
    const ok = await onSend(text, replyTo);
    if (ok) {
      setText('');
      setReplyTo(null);
    }
  };

  const cancelContext = () => {
    if (editing) setText('');
    setEditing(null);
    setReplyTo(null);
  };

  return (
    <View style={{ borderTopWidth: hairline, borderTopColor: colors.border, backgroundColor: colors.nav, paddingBottom: bottomInset }}>
      {replyTo || editing ? <ContextBar message={(replyTo ?? editing)!} mode={editing ? 'edit' : 'reply'} onCancel={cancelContext} /> : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space[2], paddingHorizontal: space[3], paddingVertical: space[2] }}>
        <View style={{ flex: 1, borderWidth: hairline, borderColor: colors.border, backgroundColor: colors.surface, minHeight: 42, justifyContent: 'center' }}>
          <TextInput
            ref={input}
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.accent}
            cursorColor={colors.accent}
            keyboardAppearance="dark"
            multiline
            maxLength={LIMITS.message.textMax}
            style={{
              color: colors.text,
              fontFamily: fonts.sans,
              fontSize: fontSize.bodyLg,
              paddingHorizontal: space[3],
              paddingTop: 10,
              paddingBottom: 10,
              maxHeight: 140,
            }}
            accessibilityLabel="Mensagem"
          />
        </View>
        <Pressable
          onPress={() => void submit()}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel={editing ? 'Salvar edição' : 'Enviar'}
          style={({ pressed }) => ({
            width: 42,
            height: 42,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: canSend ? colors.accent : colors.surface,
            borderWidth: canSend ? 0 : hairline,
            borderColor: colors.border,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Icon name={editing ? 'check' : 'send'} size={20} color={canSend ? colors.onAccent : colors.textFaint} strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  );
});

function ContextBar({ message, mode, onCancel }: { message: MessageView; mode: 'reply' | 'edit'; onCancel: () => void }) {
  const client = useNox();
  const author = useProfile(client, message.authorId);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2],
        paddingLeft: space[4],
        paddingRight: space[1],
        paddingTop: space[1],
        borderLeftWidth: 2,
        borderLeftColor: colors.accent,
        marginLeft: space[3],
        marginTop: space[2],
      }}
    >
      <Icon name={mode === 'edit' ? 'edit' : 'reply'} size={14} color={colors.accent} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="micro" color={colors.accent}>
          {mode === 'edit' ? 'EDITANDO MENSAGEM' : `RESPONDENDO A ${nameOf(author).toUpperCase()}`}
        </Txt>
        <Txt variant="small" numberOfLines={1}>
          {message.text}
        </Txt>
      </View>
      <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancelar" hitSlop={8} style={{ padding: space[2] }}>
        <Icon name="close" size={16} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}
