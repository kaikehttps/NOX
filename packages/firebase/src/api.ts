import type { ChannelAccess, ChannelType, CommunityRole } from '@nox/shared';
import type { VoiceTokenRequest } from '@nox/validation';

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface InviteInfo {
  code: string;
  createdBy: string;
  createdAt: number | null;
  expiresAt: number | null;
  maxUses: number | null;
  uses: number;
  revoked: boolean;
}

export interface VoiceGrant {
  serverUrl: string;
  token: string;
  room: string;
}

/** Cliente tipado do backend do NOX (Cloud Run). */
export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly getToken: () => Promise<string>,
    private readonly timeoutMs = 15_000,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.baseUrl) {
      throw new ApiClientError(0, 'api_not_configured', 'O servidor do NOX ainda não está no ar. Amizades, comunidades e voz voltam assim que ele for publicado.');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/v1${path}`, {
        method,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${await this.getToken()}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (err) {
      const aborted = (err as Error).name === 'AbortError';
      throw new ApiClientError(0, aborted ? 'timeout' : 'network', aborted ? 'O servidor demorou a responder.' : 'Sem conexão com o servidor.');
    } finally {
      clearTimeout(timer);
    }
    const json = (await res.json().catch(() => ({}))) as { error?: { code: string; message: string } } & T;
    if (!res.ok) {
      throw new ApiClientError(res.status, json.error?.code ?? 'unknown', json.error?.message ?? 'Algo deu errado.');
    }
    return json;
  }

  // amizades
  sendFriendRequest = (username: string) =>
    this.request<{ status: 'pending' | 'accepted'; uid: string; conversationId?: string }>('POST', '/friends/requests', { username });
  acceptFriendRequest = (id: string) =>
    this.request<{ uid: string; conversationId: string }>('POST', `/friends/requests/${encodeURIComponent(id)}/accept`);
  deleteFriendRequest = (id: string) => this.request<{ ok: true }>('DELETE', `/friends/requests/${encodeURIComponent(id)}`);
  removeFriend = (uid: string) => this.request<{ ok: true }>('DELETE', `/friends/${uid}`);
  block = (uid: string) => this.request<{ ok: true }>('PUT', `/blocks/${uid}`);
  unblock = (uid: string) => this.request<{ ok: true }>('DELETE', `/blocks/${uid}`);
  createGroup = (memberIds: string[], name: string | null) =>
    this.request<{ conversationId: string }>('POST', '/conversations/groups', { memberIds, name });

  // comunidades
  createCommunity = (name: string, description = '') =>
    this.request<{ communityId: string; defaultChannelId: string }>('POST', '/communities', { name, description });
  updateCommunity = (cid: string, patch: { name?: string; description?: string; iconUrl?: string | null }) =>
    this.request<{ ok: true }>('PATCH', `/communities/${cid}`, patch);
  deleteCommunity = (cid: string) => this.request<{ ok: true }>('DELETE', `/communities/${cid}`);
  leaveCommunity = (cid: string) => this.request<{ ok: true }>('POST', `/communities/${cid}/leave`);
  createChannel = (
    cid: string,
    input: { name: string; type: ChannelType; categoryId?: string | null; topic?: string; access?: Partial<ChannelAccess> },
  ) => this.request<{ channelId: string }>('POST', `/communities/${cid}/channels`, input);
  updateChannel = (
    cid: string,
    chid: string,
    patch: { name?: string; topic?: string; categoryId?: string | null; access?: Partial<ChannelAccess> },
  ) => this.request<{ ok: true }>('PATCH', `/communities/${cid}/channels/${chid}`, patch);
  deleteChannel = (cid: string, chid: string) => this.request<{ ok: true }>('DELETE', `/communities/${cid}/channels/${chid}`);
  createCategory = (cid: string, name: string) =>
    this.request<{ categoryId: string }>('POST', `/communities/${cid}/categories`, { name });
  deleteCategory = (cid: string, catId: string) => this.request<{ ok: true }>('DELETE', `/communities/${cid}/categories/${catId}`);
  reorder = (cid: string, kind: 'channels' | 'categories', order: string[]) =>
    this.request<{ ok: true }>('POST', `/communities/${cid}/reorder`, { kind, order });
  setMemberRole = (cid: string, uid: string, role: CommunityRole) =>
    this.request<{ ok: true }>('PUT', `/communities/${cid}/members/${uid}/role`, { role });
  removeMember = (cid: string, uid: string) => this.request<{ ok: true }>('DELETE', `/communities/${cid}/members/${uid}`);

  // convites
  createInvite = (cid: string, opts: { maxUses?: number | null; maxAgeSeconds?: number | null } = {}) =>
    this.request<{ code: string; expiresAt: number | null; maxUses: number | null }>('POST', `/communities/${cid}/invites`, opts);
  listInvites = (cid: string) => this.request<{ invites: InviteInfo[] }>('GET', `/communities/${cid}/invites`);
  revokeInvite = (code: string) => this.request<{ ok: true }>('DELETE', `/invites/${code}`);
  redeemInvite = (code: string) =>
    this.request<{ communityId: string; alreadyMember: boolean }>('POST', `/invites/${encodeURIComponent(code)}/redeem`);

  // voz
  voiceToken = (req: VoiceTokenRequest) => this.request<VoiceGrant>('POST', '/voice/token', req);

  // conta
  deleteAccount = () => this.request<{ ok: true }>('DELETE', '/account');
}
