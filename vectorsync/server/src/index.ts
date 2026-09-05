// ---------------------------------------------------------------------------
// VectorSync relay server
//
// This is intentionally a "dumb" relay, not a source of truth: every client
// runs the same CRDT (LWW-Map) logic, so the server just needs to (a) keep a
// last-write-wins snapshot per node so new joiners can catch up, and
// (b) fan messages out to every other connected socket. Because LWW
// resolution is commutative and idempotent, replaying the snapshot to a
// fresh client converges to the same state regardless of arrival order.
// ---------------------------------------------------------------------------

import { WebSocketServer, WebSocket, RawData } from 'ws';
import { createServer } from 'http';
import {
  CanvasNode,
  ClientId,
  PresenceState,
  PermissionRole,
  PermissionRule,
  SyncMessage,
} from './types.js';

const PORT = Number(process.env.PORT ?? 8787);

interface Connection {
  socket: WebSocket;
  clientId: ClientId | null;
  lastPresenceAt: number;
  mutationWindowStartedAt: number;
  mutationsInWindow: number;
  role: PermissionRole;
}

// Authoritative-by-convergence store: last-write-wins per element id.
const nodes = new Map<string, CanvasNode>();
const presence = new Map<ClientId, PresenceState>();
const connections = new Set<Connection>();
const permissions = new Map<string, PermissionRole>();
let ownerClientId: ClientId | null = null;

function send(socket: WebSocket, message: SyncMessage): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function broadcast(message: SyncMessage, exclude?: WebSocket): void {
  const payload = JSON.stringify(message);
  for (const conn of connections) {
    if (conn.socket !== exclude && conn.socket.readyState === WebSocket.OPEN) {
      conn.socket.send(payload);
    }
  }
}

const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;
const MAX_MUTATIONS_PER_SECOND = 120;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNode(value: unknown): value is CanvasNode {
  if (!value || typeof value !== 'object') return false;
  const node = value as Partial<CanvasNode>;
  return typeof node.id === 'string' && typeof node.clientId === 'string' &&
    typeof node.type === 'string' && typeof node.name === 'string' &&
    isFiniteNumber(node.clock) && isFiniteNumber(node.zIndex) &&
    isFiniteNumber(node.opacity) && node.opacity >= 0 && node.opacity <= 1 &&
    !!node.position && isFiniteNumber(node.position.x) && isFiniteNumber(node.position.y) &&
    !!node.size && isFiniteNumber(node.size.x) && isFiniteNumber(node.size.y) &&
    node.size.x >= 0 && node.size.y >= 0 && node.name.length <= 200 &&
    (node.sectionId === undefined || typeof node.sectionId === 'string') &&
    (node.imageUrl === undefined || (typeof node.imageUrl === 'string' && node.imageUrl.length <= 3_000_000)) &&
    (node.text === undefined || (typeof node.text === 'string' && node.text.length <= 10000)) &&
    (node.textFont === undefined || (typeof node.textFont === 'string' && node.textFont.length <= 80)) &&
    (node.textSize === undefined || (isFiniteNumber(node.textSize) && node.textSize >= 6 && node.textSize <= 240)) &&
    (node.textAlign === undefined || ['left', 'center', 'right'].includes(node.textAlign)) &&
    (node.textColor === undefined || (typeof node.textColor === 'string' && node.textColor.length <= 20)) &&
    (node.textPosition === undefined || ['inside', 'above', 'below'].includes(node.textPosition)) &&
    (node.textOffset === undefined || (isFiniteNumber(node.textOffset) && Math.abs(node.textOffset) <= 1000)) &&
    true;
}

function isPermissionRule(value: unknown): value is PermissionRule {
  if (!value || typeof value !== 'object') return false;
  const rule = value as Partial<PermissionRule>;
  return typeof rule.sectionId === 'string' && (rule.role === 'viewer' || rule.role === 'editor');
}

function canEdit(conn: Connection, node: CanvasNode): boolean {
  if (conn.role === 'viewer') return false;
  return !node.sectionId || (permissions.get(node.sectionId) ?? 'editor') !== 'viewer';
}

function isPresence(value: unknown): value is PresenceState {
  if (!value || typeof value !== 'object') return false;
  const presence = value as Partial<PresenceState>;
  return typeof presence.clientId === 'string' && typeof presence.name === 'string' &&
    typeof presence.color === 'string' && Array.isArray(presence.selectedIds) &&
    typeof presence.activeTool === 'string' && presence.activeTool.length <= 40 &&
    presence.selectedIds.length <= 1000 &&
    (presence.cursor === null || (!!presence.cursor && isFiniteNumber(presence.cursor.x) && isFiniteNumber(presence.cursor.y)));
}

/** LWW resolution — identical rule to the client so state always converges. */
function applyMutation(incoming: CanvasNode): boolean {
  const existing = nodes.get(incoming.id);
  if (!existing) {
    nodes.set(incoming.id, incoming);
    return true;
  }
  const higherClock = incoming.clock > existing.clock;
  const tieBreak = incoming.clock === existing.clock && incoming.clientId > existing.clientId;
  if (higherClock || tieBreak) {
    nodes.set(incoming.id, incoming);
    return true;
  }
  return false;
}

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('VectorSync relay is running.\n');
});

const wss = new WebSocketServer({ server: httpServer, maxPayload: MAX_MESSAGE_BYTES });

wss.on('connection', (socket: WebSocket) => {
  const conn: Connection = { socket, clientId: null, role: 'editor', lastPresenceAt: 0, mutationWindowStartedAt: Date.now(), mutationsInWindow: 0 };
  connections.add(conn);

  socket.on('message', (raw: RawData) => {
    let message: SyncMessage;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return; // ignore malformed frames
    }

    if (!message || typeof message !== 'object' || typeof message.type !== 'string') return;

    switch (message.type) {
      case 'HELLO': {
        if (conn.clientId || !message.payload || typeof message.payload.clientId !== 'string' ||
          typeof message.payload.name !== 'string' || typeof message.payload.color !== 'string' ||
          message.payload.name.length > 80 || message.payload.color.length > 20) return;
        conn.clientId = message.payload.clientId;
        conn.role = ownerClientId ? 'editor' : 'owner';
        if (!ownerClientId) ownerClientId = conn.clientId;
        const initialPresence: PresenceState = {
          clientId: message.payload.clientId,
          name: message.payload.name,
          color: message.payload.color,
          cursor: null,
          selectedIds: [],
          activeTool: 'select',
          lastSeen: Date.now(),
        };
        presence.set(conn.clientId, initialPresence);

        send(socket, {
          type: 'WELCOME',
          payload: {
            clientId: conn.clientId,
            nodes: Array.from(nodes.values()),
            peers: Array.from(presence.values()).filter((p) => p.clientId !== conn.clientId),
            role: conn.role,
            permissions: Array.from(permissions.entries()).map(([sectionId, role]) => ({ sectionId: sectionId as CanvasNode['id'], role })),
          },
        });

        broadcast({ type: 'PRESENCE_UPDATE', payload: initialPresence }, socket);
        break;
      }

      case 'PRESENCE_UPDATE': {
        if (!conn.clientId || !isPresence(message.payload) || message.payload.clientId !== conn.clientId) return;
        const now = Date.now();
        if (now - conn.lastPresenceAt < 50) return;
        conn.lastPresenceAt = now;
        presence.set(message.payload.clientId, { ...message.payload, lastSeen: Date.now() });
        broadcast(message, socket);
        break;
      }

      case 'NODE_MUTATED': {
        if (!conn.clientId || !isNode(message.payload) || message.payload.clientId !== conn.clientId || !canEdit(conn, message.payload)) return;
        const now = Date.now();
        if (now - conn.mutationWindowStartedAt >= 1000) {
          conn.mutationWindowStartedAt = now;
          conn.mutationsInWindow = 0;
        }
        if (++conn.mutationsInWindow > MAX_MUTATIONS_PER_SECOND) return;
        if (applyMutation(message.payload)) {
          broadcast(message, socket);
        }
        break;
      }

      case 'NODE_DELETED': {
        if (!conn.clientId || !message.payload || message.payload.clientId !== conn.clientId ||
          typeof message.payload.id !== 'string' || !isFiniteNumber(message.payload.clock)) return;
        const existing = nodes.get(message.payload.id);
        if (!conn.clientId || (existing && !canEdit(conn, existing))) return;
        const newer = !existing || message.payload.clock > existing.clock ||
          (message.payload.clock === existing.clock && message.payload.clientId > existing.clientId);
        if (existing && newer) {
          nodes.set(message.payload.id, { ...existing, deleted: true, clock: message.payload.clock, clientId: message.payload.clientId });
          broadcast(message, socket);
        }
        break;
      }

      case 'PERMISSION_UPDATE': {
        if (!conn.clientId || conn.role !== 'owner' || !isPermissionRule(message.payload)) return;
        permissions.set(message.payload.sectionId, message.payload.role);
        broadcast(message);
        break;
      }

      default:
        break;
    }
  });

  socket.on('close', () => {
    connections.delete(conn);
    if (conn.clientId) {
      presence.delete(conn.clientId);
      broadcast({ type: 'PEER_LEFT', payload: { clientId: conn.clientId } });
      if (ownerClientId === conn.clientId) ownerClientId = null;
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`[vectorsync] relay listening on ws://localhost:${PORT}`);
});

function shutdown(): void {
  for (const conn of connections) conn.socket.close(1001, 'Server shutting down');
  wss.close(() => httpServer.close());
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
