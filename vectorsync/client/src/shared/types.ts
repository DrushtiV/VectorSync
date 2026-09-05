// ---------------------------------------------------------------------------
// Shared protocol types
// These describe the wire format exchanged between the browser client and
// the WebSocket relay server. Keeping them isomorphic (no DOM/Node-only
// APIs) means the exact same file can be imported by both sides.
// ---------------------------------------------------------------------------

export type ClientId = string & { readonly __brand: unique symbol };
export type ElementId = string & { readonly __brand: unique symbol };

export interface Vector2D {
  x: number;
  y: number;
}

export type ShapeType = 'rectangle' | 'ellipse' | 'triangle' | 'arrow' | 'path' | 'text' | 'title' | 'connector' | 'group' | 'diamond' | 'star' | 'polygon' | 'pill' | 'sticky' | 'image' | 'line';
export type PathStyle = 'straight' | 'ortho';
export type PermissionRole = 'viewer' | 'editor' | 'owner';
export type TextAlign = 'left' | 'center' | 'right';
export type TextPosition = 'inside' | 'above' | 'below';

export interface CanvasNode {
  id: ElementId;
  type: ShapeType;
  position: Vector2D;
  size: Vector2D;
  rotation: number;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  opacity: number;
  text?: string;
  points?: Vector2D[];
  sourceId?: ElementId;
  targetId?: ElementId;
  pathStyle?: PathStyle;
  childrenIds?: ElementId[];
  sectionId?: ElementId;
  cornerRadius?: number;
  sides?: number;
  imageUrl?: string;
  textFont?: string;
  textSize?: number;
  textAlign?: TextAlign;
  textColor?: string;
  textPosition?: TextPosition;
  textOffset?: number;
  name: string;
  zIndex: number;
  /** Logical clock (Lamport-style) used for LWW conflict resolution. */
  clock: number;
  /** Id of the client that produced this version of the node. */
  clientId: ClientId;
  deleted?: boolean;
}

export interface PresenceState {
  clientId: ClientId;
  name: string;
  color: string;
  cursor: Vector2D | null;
  selectedIds: ElementId[];
  activeTool: string;
  lastSeen: number;
}

export interface PermissionRule {
  sectionId: ElementId;
  role: PermissionRole;
}

export type SyncMessage =
  | { type: 'HELLO'; payload: { clientId: ClientId; name: string; color: string } }
  | { type: 'WELCOME'; payload: { clientId: ClientId; nodes: CanvasNode[]; peers: PresenceState[]; role: PermissionRole; permissions: PermissionRule[] } }
  | { type: 'PRESENCE_UPDATE'; payload: PresenceState }
  | { type: 'PEER_LEFT'; payload: { clientId: ClientId } }
  | { type: 'NODE_MUTATED'; payload: CanvasNode }
  | { type: 'NODE_DELETED'; payload: { id: ElementId; clock: number; clientId: ClientId } }
  | { type: 'PERMISSION_UPDATE'; payload: PermissionRule }
  | { type: 'STATE_VECTOR_SYNC'; payload: { stateVector: Record<string, number> } };

export const asClientId = (v: string): ClientId => v as ClientId;
export const asElementId = (v: string): ElementId => v as ElementId;
