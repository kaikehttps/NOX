import { describe, expect, it } from 'vitest';
import {
  BurstLimiter,
  can,
  canAssignRole,
  canOnChannel,
  canRemoveMember,
  dmConversationId,
  extractMentions,
  parseVoiceRoomName,
  tokenize,
  voiceRoomName,
  DEFAULT_CHANNEL_ACCESS,
} from './index';

describe('permissions', () => {
  it('respeita a hierarquia de papéis', () => {
    expect(can('owner', 'community.delete')).toBe(true);
    expect(can('admin', 'community.delete')).toBe(false);
    expect(can('moderator', 'invites.create')).toBe(true);
    expect(can('member', 'invites.create')).toBe(false);
    expect(can(null, 'invites.create')).toBe(false);
  });

  it('exige visualização para qualquer operação no canal', () => {
    const staffOnly = { access: { ...DEFAULT_CHANNEL_ACCESS, view: 'moderator' as const } };
    expect(canOnChannel('member', staffOnly, 'send')).toBe(false);
    expect(canOnChannel('moderator', staffOnly, 'send')).toBe(true);
    const readOnly = { access: { ...DEFAULT_CHANNEL_ACCESS, send: 'admin' as const } };
    expect(canOnChannel('member', readOnly, 'view')).toBe(true);
    expect(canOnChannel('member', readOnly, 'send')).toBe(false);
  });

  it('impede promoções acima do próprio papel e ações sobre pares', () => {
    expect(canAssignRole('admin', 'member', 'moderator')).toBe(true);
    expect(canAssignRole('admin', 'member', 'admin')).toBe(false);
    expect(canAssignRole('admin', 'admin', 'member')).toBe(false);
    expect(canAssignRole('owner', 'admin', 'owner')).toBe(false);
    expect(canAssignRole('moderator', 'member', 'member')).toBe(false);
    expect(canRemoveMember('moderator', 'member')).toBe(true);
    expect(canRemoveMember('moderator', 'moderator')).toBe(false);
    expect(canRemoveMember('admin', 'owner')).toBe(false);
  });
});

describe('ids', () => {
  it('gera a mesma DM independentemente da ordem', () => {
    expect(dmConversationId('b', 'a')).toBe(dmConversationId('a', 'b'));
    expect(dmConversationId('a', 'b')).toBe('dm_a_b');
  });

  it('serializa e interpreta nomes de sala de voz', () => {
    const ch = { kind: 'channel' as const, communityId: 'c1', channelId: 'v1' };
    expect(parseVoiceRoomName(voiceRoomName(ch))).toEqual(ch);
    const cv = { kind: 'conversation' as const, conversationId: 'dm_a_b' };
    expect(parseVoiceRoomName(voiceRoomName(cv))).toEqual(cv);
    expect(parseVoiceRoomName('other:ch:x:y')).toBeNull();
    expect(parseVoiceRoomName('nox:ch:x')).toBeNull();
  });
});

describe('text', () => {
  it('extrai menções únicas', () => {
    expect(extractMentions('oi <@u1> e <@u2> e <@u1>')).toEqual(['u1', 'u2']);
  });

  it('tokeniza links e menções sem aceitar protocolos inseguros', () => {
    const tokens = tokenize('veja https://nox.app/x, <@u1> javascript:alert(1)');
    expect(tokens).toEqual([
      { type: 'text', value: 'veja ' },
      { type: 'link', href: 'https://nox.app/x' },
      { type: 'text', value: ', ' },
      { type: 'mention', uid: 'u1' },
      { type: 'text', value: ' javascript:alert(1)' },
    ]);
  });

  it('limita rajadas dentro da janela', () => {
    const limiter = new BurstLimiter(2, 1000);
    expect(limiter.tryAcquire(0)).toBe(true);
    expect(limiter.tryAcquire(10)).toBe(true);
    expect(limiter.tryAcquire(20)).toBe(false);
    expect(limiter.tryAcquire(1500)).toBe(true);
  });
});
