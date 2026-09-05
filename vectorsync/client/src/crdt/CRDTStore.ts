// ---------------------------------------------------------------------------
// CRDTCanvasStore
//
// A state-based Last-Write-Wins Map (CvRDT). Every node carries a Lamport
// clock + client id pair; when two versions of the same node collide the
// higher clock wins, and ties are broken deterministically by client id.
// Because the merge function is commutative, associative and idempotent,
// every replica converges to the same state regardless of message order —
// no locks, no central authority required.
// ---------------------------------------------------------------------------

import {
  CanvasNode,
  ClientId,
  ElementId,
  PresenceState,
  PermissionRole,
  PermissionRule,
  SyncMessage,
  asClientId,
} from '../shared/types';

type Listener = () => void;

function randomColor(seed: string): string {
  const palette = ['#F97066', '#F79009', '#7CD4FD', '#84ADFF', '#9E77ED', '#3CCB7F', '#FF8C6B'];
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

export class CRDTCanvasStore {
  public readonly clientId: ClientId;
  public readonly displayName: string;
  public readonly color: string;

  private nodes = new Map<ElementId, CanvasNode>();
  private peers = new Map<ClientId, PresenceState>();
  private socket: WebSocket | null = null;
  private clock = 0;
  private listeners = new Set<Listener>();
  private connectionListeners = new Set<(status: ConnectionStatus) => void>();
  private status: ConnectionStatus = 'connecting';
  private reconnectAttempt = 0;
  private wsUrl: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private nodesSnapshot: CanvasNode[] = [];
  private peersSnapshot: PresenceState[] = [];
  private localPresence: PresenceState;
  private pendingMessages: SyncMessage[] = [];
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private role: PermissionRole = 'editor';
  private permissions = new Map<ElementId, PermissionRole>();
  private permissionsSnapshot: PermissionRule[] = [];

  constructor(wsUrl: string, displayName: string) {
    this.wsUrl = wsUrl;
    this.clientId = asClientId(
      `${displayName}-${Math.random().toString(36).slice(2, 8)}`
    );
    this.displayName = displayName;
    this.color = randomColor(this.clientId);
    this.localPresence = {
      clientId: this.clientId,
      name: this.displayName,
      color: this.color,
      cursor: null,
      selectedIds: [],
      activeTool: 'select',
      lastSeen: Date.now(),
    };
    void this.restoreFromIndexedDb();
    this.connect();
  }

  // -- connection lifecycle ---------------------------------------------

  private connect(): void {
    if (this.destroyed) return;
    this.setStatus(this.reconnectAttempt === 0 ? 'connecting' : 'reconnecting');
    const socket = new WebSocket(this.wsUrl);
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempt = 0;
      this.setStatus('connected');
      this.send({
        type: 'HELLO',
        payload: { clientId: this.clientId, name: this.displayName, color: this.color },
      });
      this.flushPendingMessages();
    };

    socket.onmessage = (event: MessageEvent) => {
      try {
        const message: SyncMessage = JSON.parse(event.data);
        this.handleIncoming(message);
      } catch {
        // ignore malformed frames
      }
    };

    socket.onclose = () => {
      if (this.socket !== socket || this.destroyed) return;
      this.setStatus('disconnected');
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      if (this.socket === socket) socket.close();
    };
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer) return;
    this.reconnectAttempt += 1;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 8000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private send(message: SyncMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else if (message.type === 'NODE_MUTATED' || message.type === 'NODE_DELETED') {
      this.pendingMessages.push(message);
    }
  }

  private flushPendingMessages(): void {
    const pending = this.pendingMessages;
    this.pendingMessages = [];
    for (const message of pending) this.send(message);
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    for (const l of this.connectionListeners) l(this.status);
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  // -- incoming sync -------------------------------------------------------

  private handleIncoming(message: SyncMessage): void {
    switch (message.type) {
      case 'WELCOME': {
        this.role = message.payload.role;
        this.permissions = new Map(message.payload.permissions.map((rule) => [rule.sectionId, rule.role]));
        this.refreshPermissionSnapshot();
        for (const node of message.payload.nodes) {
          this.mergeNode(node);
        }
        for (const peer of message.payload.peers) this.peers.set(peer.clientId, peer);
        this.refreshSnapshots();
        this.emit();
        break;
      }
      case 'NODE_MUTATED': {
        this.mergeNode(message.payload);
        this.emit();
        break;
      }
      case 'NODE_DELETED': {
        const existing = this.nodes.get(message.payload.id);
        if (existing) {
          this.mergeNode({ ...existing, deleted: true, clock: message.payload.clock, clientId: message.payload.clientId });
        }
        this.emit();
        break;
      }
      case 'PRESENCE_UPDATE': {
        this.peers.set(message.payload.clientId, message.payload);
        this.refreshSnapshots();
        this.emit();
        break;
      }
      case 'PEER_LEFT': {
        this.peers.delete(message.payload.clientId);
        this.refreshSnapshots();
        this.emit();
        break;
      }
      case 'PERMISSION_UPDATE': {
        this.permissions.set(message.payload.sectionId, message.payload.role);
        this.refreshPermissionSnapshot();
        this.emit();
        break;
      }
      default:
        break;
    }
  }

  /** LWW merge: higher clock wins; ties broken by client id. */
  private mergeNode(incoming: CanvasNode): void {
    const existing = this.nodes.get(incoming.id);
    if (!existing) {
      this.nodes.set(incoming.id, incoming);
      this.clock = Math.max(this.clock, incoming.clock);
      this.refreshSnapshots();
      this.schedulePersist();
      return;
    }
    const higherClock = incoming.clock > existing.clock;
    const tie = incoming.clock === existing.clock && incoming.clientId > existing.clientId;
    if (higherClock || tie) {
      this.nodes.set(incoming.id, incoming);
      this.refreshSnapshots();
      this.schedulePersist();
    }
    this.clock = Math.max(this.clock, incoming.clock);
  }

  // -- local mutation API ---------------------------------------------------

  private nextClock = (): number => {
    this.clock += 1;
    return this.clock;
  };

  upsertNode(partial: Omit<CanvasNode, 'clock' | 'clientId'>): void {
    if (!this.canEditNode(partial)) return;
    const node: CanvasNode = { ...partial, clock: this.nextClock(), clientId: this.clientId };
    this.nodes.set(node.id, node);
    this.refreshSnapshots();
    this.emit();
    this.schedulePersist();
    this.send({ type: 'NODE_MUTATED', payload: node });
  }

  deleteNode(id: ElementId): void {
    const existing = this.nodes.get(id);
    if (!existing || existing.deleted || !this.canEditNode(existing)) return;
    const clock = this.nextClock();
    const tombstone: CanvasNode = { ...existing, deleted: true, clock, clientId: this.clientId };
    this.nodes.set(id, tombstone);
    this.refreshSnapshots();
    this.emit();
    this.schedulePersist();
    this.send({ type: 'NODE_MUTATED', payload: tombstone });
  }

  updatePresence(partial: Partial<Omit<PresenceState, 'clientId' | 'name' | 'color'>>): void {
    const next: PresenceState = { ...this.localPresence, ...partial, lastSeen: Date.now() };
    this.localPresence = next;
    this.send({ type: 'PRESENCE_UPDATE', payload: next });
  }

  // -- reads -----------------------------------------------------------------

  getNodes(): CanvasNode[] {
    return this.nodesSnapshot;
  }

  getPeers(): PresenceState[] {
    return this.peersSnapshot;
  }

  getRole(): PermissionRole {
    return this.role;
  }

  getPermissions(): PermissionRule[] {
    return this.permissionsSnapshot;
  }

  setPermission(sectionId: ElementId, role: 'viewer' | 'editor'): void {
    if (this.role !== 'owner') return;
    this.permissions.set(sectionId, role);
    this.refreshPermissionSnapshot();
    this.emit();
    this.send({ type: 'PERMISSION_UPDATE', payload: { sectionId, role } });
  }

  // -- subscriptions -----------------------------------------------------------

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeConnection(listener: (status: ConnectionStatus) => void): () => void {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  private refreshSnapshots(): void {
    this.nodesSnapshot = Array.from(this.nodes.values())
      .filter((node) => !node.deleted)
      .sort((a, b) => a.zIndex - b.zIndex || a.clientId.localeCompare(b.clientId) || a.id.localeCompare(b.id));
    this.peersSnapshot = Array.from(this.peers.values()).filter((p) => p.clientId !== this.clientId);
  }

  private refreshPermissionSnapshot(): void {
    this.permissionsSnapshot = Array.from(this.permissions.entries()).map(([sectionId, role]) => ({ sectionId, role }));
  }

  private canEditNode(node: Pick<CanvasNode, 'sectionId'>): boolean {
    return this.role !== 'viewer' && (!node.sectionId || (this.permissions.get(node.sectionId) ?? 'editor') !== 'viewer');
  }

  private schedulePersist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.persistToIndexedDb();
    }, 100);
  }

  private async restoreFromIndexedDb(): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    const snapshot = await new Promise<{ nodes: CanvasNode[]; clock: number } | null>((resolve) => {
      const request = indexedDB.open('vectorsync-local', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('documents');
      request.onerror = () => resolve(null);
      request.onsuccess = () => {
        const transaction = request.result.transaction('documents', 'readonly');
        const getRequest = transaction.objectStore('documents').get('default');
        getRequest.onerror = () => resolve(null);
        getRequest.onsuccess = () => resolve(getRequest.result ?? null);
      };
    });
    if (!snapshot || this.destroyed) return;
    this.clock = Math.max(this.clock, snapshot.clock);
    for (const node of snapshot.nodes) this.mergeNode(node);
    this.emit();
  }

  private async persistToIndexedDb(): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    await new Promise<void>((resolve) => {
      const request = indexedDB.open('vectorsync-local', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('documents');
      request.onerror = () => resolve();
      request.onsuccess = () => {
        const transaction = request.result.transaction('documents', 'readwrite');
        transaction.objectStore('documents').put({ nodes: Array.from(this.nodes.values()), clock: this.clock }, 'default');
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => resolve();
      };
    });
  }

  destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.reconnectTimer = null;
    this.persistTimer = null;
    void this.persistToIndexedDb();
    this.socket?.close();
    this.socket = null;
  }
}

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
