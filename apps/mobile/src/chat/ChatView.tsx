import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, FlatList, Keyboard, KeyboardAvoidingView, Platform, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deleteMessage, editMessage, toggleReaction, type MessageView } from '@nox/firebase';
import { useMessages } from '@nox/firebase/react';
import { BRAND, messagePreview, type MessageScope } from '@nox/shared';
import { EmptyState, InlineError, Loading, useToast } from '../components/Feedback';
import { Txt } from '../components/Txt';
import { errorMessage } from '../lib/errors';
import { haptic } from '../lib/haptics';
import { useNox } from '../providers/NoxProvider';
import { useMe } from '../providers/SessionProvider';
import { colors, space } from '../theme';
import { Composer, type ComposerHandle } from './Composer';
import { MessageMenu } from './MessageMenu';
import { DayDivider, FailedRow, MessageRow } from './MessageRow';
import { buildRows, type ChatRow } from './rows';

interface Props {
  scope: MessageScope;
  header: ReactNode;
  /** Quando definido, o envio fica desabilitado e o motivo aparece no lugar do campo. */
  blockedReason: string | null;
  /** Pode apagar mensagens de outros (moderação de canal). */
  canModerate?: boolean;
  placeholder: string;
  emptyText?: string;
}

function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

/** Chat compartilhado por DMs, grupos e canais de texto. */
export function ChatView({ scope, header, blockedReason, canModerate = false, placeholder, emptyText = BRAND.empty.channel }: Props) {
  const client = useNox();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { uid } = useMe();
  const keyboard = useKeyboardVisible();
  const composer = useRef<ComposerHandle>(null);
  const [menuFor, setMenuFor] = useState<MessageView | null>(null);

  const { messages, failed, loading, loadingOlder, hasOlder, error, loadOlder, send, retry, discard } = useMessages(client, scope);
  const rows = useMemo(() => buildRows(messages, failed), [messages, failed]);

  const onLongPress = useCallback((m: MessageView) => {
    haptic.select();
    Keyboard.dismiss();
    setMenuFor(m);
  }, []);

  const onToggleReaction = useCallback(
    (m: MessageView, emoji: string, active: boolean) => {
      haptic.light();
      toggleReaction(client, scope, m.id, emoji, !active).catch((err: unknown) => toast(errorMessage(err, 'Não foi possível reagir.'), 'error'));
    },
    [client, toast, scope],
  );

  const onLinkError = useCallback(() => toast('Não foi possível abrir o link.', 'error'), [toast]);
  const onRetry = useCallback((id: string) => void retry(id), [retry]);

  const handleSend = useCallback(
    async (text: string, replyTo: MessageView | null) => {
      const ok = await send(text, replyTo ? { id: replyTo.id, authorId: replyTo.authorId, preview: messagePreview(replyTo.text, 120) } : null);
      if (!ok) toast('Calma: muitas mensagens em sequência. Aguarde alguns segundos.', 'error');
      return ok;
    },
    [send, toast],
  );

  const handleEdit = useCallback(
    async (m: MessageView, text: string) => {
      try {
        await editMessage(client, scope, m.id, text);
        return true;
      } catch (err) {
        toast(errorMessage(err, 'Não foi possível editar.'), 'error');
        return false;
      }
    },
    [client, scope, toast],
  );

  const handleDelete = useCallback(
    (m: MessageView) => {
      Alert.alert('Apagar mensagem?', 'Ela some para todos na conversa.', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: () => void deleteMessage(client, scope, m.id).catch((err: unknown) => toast(errorMessage(err, 'Não foi possível apagar.'), 'error')),
        },
      ]);
    },
    [client, scope, toast],
  );

  const renderItem = useCallback(
    ({ item }: { item: ChatRow }) => {
      switch (item.kind) {
        case 'day':
          return <DayDivider label={item.label} />;
        case 'failed':
          return <FailedRow entry={item.entry} onRetry={onRetry} onDiscard={discard} />;
        default:
          return (
            <MessageRow
              message={item.message}
              grouped={item.grouped}
              myUid={uid}
              onLongPress={onLongPress}
              onToggleReaction={onToggleReaction}
              onLinkError={onLinkError}
            />
          );
      }
    },
    [uid, onLongPress, onToggleReaction, onLinkError, onRetry, discard],
  );

  const onEndReached = useCallback(() => {
    if (hasOlder && !loadingOlder) void loadOlder();
  }, [hasOlder, loadingOlder, loadOlder]);

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.bg }}>
      {header}
      <View style={{ flex: 1 }}>
        {error && rows.length === 0 ? (
          <InlineError message={errorMessage(error, 'Não foi possível carregar as mensagens.')} style={{ margin: space[4] }} />
        ) : loading && rows.length === 0 ? (
          <Loading />
        ) : rows.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <EmptyState code="// início do registro" text={emptyText} />
          </View>
        ) : (
          <FlatList
            data={rows}
            inverted
            keyExtractor={(r) => r.key}
            renderItem={renderItem}
            onEndReached={onEndReached}
            onEndReachedThreshold={0.5}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            initialNumToRender={20}
            maxToRenderPerBatch={20}
            windowSize={11}
            removeClippedSubviews={Platform.OS === 'android'}
            contentContainerStyle={{ paddingVertical: space[2] }}
            ListFooterComponent={
              loadingOlder ? (
                <ActivityIndicator style={{ padding: space[4] }} color={colors.textMuted} />
              ) : !hasOlder ? (
                <Txt variant="micro" style={{ textAlign: 'center', padding: space[4] }}>
                  — INÍCIO DO REGISTRO —
                </Txt>
              ) : undefined
            }
          />
        )}
      </View>
      <Composer
        ref={composer}
        placeholder={placeholder}
        blockedReason={blockedReason}
        onSend={handleSend}
        onEdit={handleEdit}
        bottomInset={keyboard ? 0 : insets.bottom}
      />
      <MessageMenu
        message={menuFor}
        myUid={uid}
        canSend={!blockedReason}
        canModerate={canModerate}
        onClose={() => setMenuFor(null)}
        onReact={onToggleReaction}
        // Foca o campo só depois que o painel fechar (o teclado não abre sobre um Modal saindo).
        onReply={(m) => setTimeout(() => composer.current?.reply(m), 260)}
        onCopy={(m) => {
          void Clipboard.setStringAsync(m.text).then(() => toast('Texto copiado.'));
        }}
        onEdit={(m) => setTimeout(() => composer.current?.edit(m), 260)}
        onDelete={handleDelete}
      />
    </KeyboardAvoidingView>
  );
}
