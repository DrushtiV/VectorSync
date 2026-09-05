import { useCallback, useEffect, useRef, useState } from 'react';
import { CRDTCanvasStore } from '../crdt/CRDTStore';
import { useNodes, usePeers } from '../hooks/useCRDTStore';
import { Camera, screenToWorld, visibleWorldBounds, zoomAt } from '../canvas/camera';
import { drawNode, drawSelectionOutline, hitTest } from '../canvas/renderShape';
import { connectorPath, pathBounds } from '../canvas/connectors';
import { RTree, BBox } from '../spatial/RTree';
import { CanvasNode, ElementId, ShapeType, Vector2D, asElementId } from '../shared/types';

export type Tool = 'select' | ShapeType;

interface Props {
  store: CRDTCanvasStore;
  tool: Tool;
  onToolUsed: () => void;
  selectedIds: ElementId[];
  onSelectionChange: (ids: ElementId[]) => void;
  fillColor: string;
}

const SHAPE_DEFAULTS: Record<string, { w: number; h: number }> = {
  rectangle: { w: 160, h: 110 },
  ellipse: { w: 140, h: 140 },
  triangle: { w: 150, h: 130 },
  arrow: { w: 180, h: 40 },
  text: { w: 200, h: 28 },
  connector: { w: 120, h: 80 },
  diamond: { w: 150, h: 120 },
  star: { w: 140, h: 140 },
  polygon: { w: 140, h: 140 },
  pill: { w: 180, h: 60 },
  sticky: { w: 180, h: 160 },
  line: { w: 180, h: 12 },
  title: { w: 420, h: 64 },
};

let localZCounter = Date.now();

export function CanvasStage({ store, tool, onToolUsed, selectedIds, onSelectionChange, fillColor }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [camera, setCamera] = useState<Camera>({ scale: 1, tx: 0, ty: 0 });
  const [visibleCount, setVisibleCount] = useState(0);
  const lastPresenceAt = useRef(0);
  const lastDragAt = useRef(0);
  const pendingDragPoint = useRef<Vector2D | null>(null);
  const lastPointerScreen = useRef<Vector2D>({ x: 0, y: 0 });
  const nodes = useNodes(store);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const peers = usePeers(store);
  const peersRef = useRef(peers);
  peersRef.current = peers;

  const rtreeRef = useRef(new RTree<CanvasNode>());
  const dragState = useRef<{
    mode: 'pan' | 'drag' | 'draw' | 'marquee' | null;
    start: Vector2D;
    originCamera: Camera;
    draggedIds: ElementId[];
    dragOffsets: Map<ElementId, Vector2D>;
    drawId: ElementId | null;
  }>({ mode: null, start: { x: 0, y: 0 }, originCamera: camera, draggedIds: [], dragOffsets: new Map(), drawId: null });

  // Rebuild spatial index whenever the node set changes.
  useEffect(() => {
    rtreeRef.current.rebuild(
      nodes.map((n) => ({
        item: n,
        box: spatialBounds(n, nodes),
      }))
    );
  }, [nodes]);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = container.clientWidth * dpr;
    canvas.height = container.clientHeight * dpr;
    canvas.style.width = `${container.clientWidth}px`;
    canvas.style.height = `${container.clientHeight}px`;
    const ctx = canvas.getContext('2d');
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);

  useEffect(() => {
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [resize]);

  // Render loop — culls via R-Tree against the current viewport, then draws.
  useEffect(() => {
    let raf = 0;
    const render = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) {
        raf = requestAnimationFrame(render);
        return;
      }
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      ctx.save();
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#15161c';
      ctx.fillRect(0, 0, width, height);
      drawGrid(ctx, camera, width, height);

      ctx.translate(camera.tx, camera.ty);
      ctx.scale(camera.scale, camera.scale);

      const bounds: BBox = visibleWorldBounds(camera, width, height);
      const visible = rtreeRef.current.query(bounds);
      setVisibleCount((prev) => (prev === visible.length ? prev : visible.length));
      const currentNodes = nodesRef.current;

      for (const node of visible) drawNode(ctx, node, currentNodes);
      for (const node of visible) {
        if (selectedIds.includes(node.id)) drawSelectionOutline(ctx, node, '#7CD4FD');
      }

      ctx.restore();

      // Peer presence overlay (screen space, drawn after restore).
      for (const peer of peersRef.current) {
        if (!peer.cursor) continue;
        const screen = { x: peer.cursor.x * camera.scale + camera.tx, y: peer.cursor.y * camera.scale + camera.ty };
        drawCursor(ctx, screen, peer.color, peer.name);
      }

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [camera, selectedIds]);

  const getPointer = (e: React.PointerEvent): Vector2D => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const screenPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (e.ctrlKey || e.metaKey) {
      setCamera((cam) => zoomAt(cam, screenPoint, e.deltaY < 0 ? 1.08 : 0.93));
    } else {
      setCamera((cam) => ({ ...cam, tx: cam.tx - e.deltaX, ty: cam.ty - e.deltaY }));
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    const screenPoint = getPointer(e);
    lastPointerScreen.current = screenPoint;
    const worldPoint = screenToWorld(camera, screenPoint);

    if (tool === 'select') {
      const hit = [...nodes].reverse().find((n) => hitTest(n, worldPoint.x, worldPoint.y));
      if (hit) {
        const nextSelection = e.shiftKey
          ? selectedIds.includes(hit.id)
            ? selectedIds.filter((id) => id !== hit.id)
            : [...selectedIds, hit.id]
          : [hit.id];
        onSelectionChange(nextSelection);
        const offsets = new Map<ElementId, Vector2D>();
        for (const id of nextSelection) {
          const n = nodes.find((nn) => nn.id === id);
          if (n) offsets.set(id, { x: worldPoint.x - n.position.x, y: worldPoint.y - n.position.y });
        }
        dragState.current = { mode: 'drag', start: worldPoint, originCamera: camera, draggedIds: nextSelection, dragOffsets: offsets, drawId: null };
      } else {
        if (!e.shiftKey) onSelectionChange([]);
        dragState.current = { mode: e.altKey ? 'pan' : 'marquee', start: screenPoint, originCamera: camera, draggedIds: [], dragOffsets: new Map(), drawId: null };
      }
    } else if (tool === 'path') {
      dragState.current = { mode: 'pan', start: screenPoint, originCamera: camera, draggedIds: [], dragOffsets: new Map(), drawId: null };
    } else if (tool === 'connector') {
      if (selectedIds.length < 2) return;
      const source = nodes.find((node) => node.id === selectedIds[0]);
      const target = nodes.find((node) => node.id === selectedIds[1]);
      if (!source || !target) return;
      const points = connectorPath({
        id: asElementId('preview'), type: 'connector', position: { x: 0, y: 0 }, size: { x: 0, y: 0 },
        rotation: 0, fillColor, strokeColor: '#7CD4FD', strokeWidth: 2, opacity: 1, name: 'Connector', zIndex: 0,
        clock: 0, clientId: store.clientId, sourceId: source.id, targetId: target.id, pathStyle: 'ortho',
      }, nodes);
      const bounds = pathBounds(points);
      const id = asElementId(`${store.clientId}-connector-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
      store.upsertNode({
        id, type: 'connector', position: { x: bounds.minX, y: bounds.minY },
        size: { x: Math.max(1, bounds.maxX - bounds.minX), y: Math.max(1, bounds.maxY - bounds.minY) },
        rotation: 0, fillColor, strokeColor: '#7CD4FD', strokeWidth: 2, opacity: 1,
        name: `Connector ${nodes.filter((node) => node.type === 'connector').length + 1}`, zIndex: localZCounter++,
        sourceId: source.id, targetId: target.id, pathStyle: 'ortho',
      });
      onSelectionChange([id]);
      onToolUsed();
    } else {
      const defaults = SHAPE_DEFAULTS[tool] ?? { w: 120, h: 120 };
      const id = asElementId(`${store.clientId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
      const node: Omit<CanvasNode, 'clock' | 'clientId'> = {
        id,
        type: tool,
        position: { x: worldPoint.x - defaults.w / 2, y: worldPoint.y - defaults.h / 2 },
        size: { x: defaults.w, y: defaults.h },
        rotation: 0,
        fillColor,
        strokeColor: '#1b1c22',
        strokeWidth: tool === 'text' ? 0 : 1,
        opacity: 1,
        text: tool === 'text' ? 'Double-click to edit' : tool === 'sticky' ? 'Note' : tool === 'title' ? 'Diagram title' : undefined,
        textSize: tool === 'title' ? 32 : undefined,
        textAlign: tool === 'title' ? 'center' : undefined,
        textColor: tool === 'title' ? '#ECEEF2' : undefined,
        cornerRadius: tool === 'rectangle' ? 8 : undefined,
        sides: tool === 'polygon' ? 6 : undefined,
        name: `${tool[0].toUpperCase()}${tool.slice(1)} ${nodes.length + 1}`,
        zIndex: localZCounter++,
      };
      store.upsertNode(node);
      onSelectionChange([id]);
      onToolUsed();
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const screenPoint = getPointer(e);
    lastPointerScreen.current = screenPoint;
    const worldPoint = screenToWorld(camera, screenPoint);
    if (Date.now() - lastPresenceAt.current >= 50) {
      lastPresenceAt.current = Date.now();
      store.updatePresence({ cursor: worldPoint, selectedIds, activeTool: tool });
    }

    const drag = dragState.current;
    if (drag.mode === 'pan') {
      const dx = screenPoint.x - drag.start.x;
      const dy = screenPoint.y - drag.start.y;
      setCamera({ ...drag.originCamera, tx: drag.originCamera.tx + dx, ty: drag.originCamera.ty + dy });
    } else if (drag.mode === 'drag') {
      pendingDragPoint.current = worldPoint;
      if (Date.now() - lastDragAt.current < 50) return;
      lastDragAt.current = Date.now();
      for (const id of drag.draggedIds) {
        const node = nodes.find((n) => n.id === id);
        const offset = drag.dragOffsets.get(id);
        if (node && offset) {
          store.upsertNode({
            ...node,
            position: { x: worldPoint.x - offset.x, y: worldPoint.y - offset.y },
          });
        }
      }
    }
  };

  const handlePointerUp = () => {
    const drag = dragState.current;
    if (drag.mode === 'drag' && pendingDragPoint.current) {
      for (const id of drag.draggedIds) {
        const node = nodes.find((n) => n.id === id);
        const offset = drag.dragOffsets.get(id);
        if (node && offset) {
          store.upsertNode({ ...node, position: {
            x: pendingDragPoint.current.x - offset.x,
            y: pendingDragPoint.current.y - offset.y,
          }});
        }
      }
    } else if (drag.mode === 'marquee') {
      const start = screenToWorld(drag.originCamera, drag.start);
      const end = screenToWorld(camera, lastPointerScreen.current);
      const minX = Math.min(start.x, end.x);
      const minY = Math.min(start.y, end.y);
      const maxX = Math.max(start.x, end.x);
      const maxY = Math.max(start.y, end.y);
      const selected = nodes.filter((node) => {
        const box = rotatedBounds(node);
        return box.minX <= maxX && box.maxX >= minX && box.minY <= maxY && box.maxY >= minY;
      }).map((node) => node.id);
      onSelectionChange(selected);
    }
    pendingDragPoint.current = null;
    dragState.current = { mode: null, start: { x: 0, y: 0 }, originCamera: camera, draggedIds: [], dragOffsets: new Map(), drawId: null };
  };

  const handlePointerCancel = () => {
    pendingDragPoint.current = null;
    dragState.current = { mode: null, start: { x: 0, y: 0 }, originCamera: camera, draggedIds: [], dragOffsets: new Map(), drawId: null };
  };

  return (
    <div ref={containerRef} className="canvas-stage">
      <canvas
        ref={canvasRef}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        style={{ cursor: tool === 'select' ? 'default' : 'crosshair' }}
      />
      <div className="canvas-hud">
        <span>{Math.round(camera.scale * 100)}%</span>
        <span className="hud-dot">•</span>
        <span>{visibleCount} of {nodes.length} nodes rendered</span>
      </div>
    </div>
  );
}

function rotatedBounds(node: CanvasNode): BBox {
  const cx = node.position.x + node.size.x / 2;
  const cy = node.position.y + node.size.y / 2;
  const angle = (node.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const corners = [
    { x: node.position.x, y: node.position.y },
    { x: node.position.x + node.size.x, y: node.position.y },
    { x: node.position.x, y: node.position.y + node.size.y },
    { x: node.position.x + node.size.x, y: node.position.y + node.size.y },
  ].map((p) => ({ x: cx + (p.x - cx) * cos - (p.y - cy) * sin, y: cy + (p.x - cx) * sin + (p.y - cy) * cos }));
  return {
    minX: Math.min(...corners.map((p) => p.x)),
    minY: Math.min(...corners.map((p) => p.y)),
    maxX: Math.max(...corners.map((p) => p.x)),
    maxY: Math.max(...corners.map((p) => p.y)),
  };
}

function spatialBounds(node: CanvasNode, nodes: CanvasNode[]): BBox {
  if (node.type === 'connector') return pathBounds(connectorPath(node, nodes));
  return rotatedBounds(node);
}

function drawGrid(ctx: CanvasRenderingContext2D, camera: Camera, width: number, height: number) {
  const gridSize = 40 * camera.scale;
  if (gridSize < 6) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.045)';
  ctx.lineWidth = 1;
  const offsetX = camera.tx % gridSize;
  const offsetY = camera.ty % gridSize;
  for (let x = offsetX; x < width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = offsetY; y < height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCursor(ctx: CanvasRenderingContext2D, p: Vector2D, color: string, name: string) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 14);
  ctx.lineTo(4, 11);
  ctx.lineTo(7, 17);
  ctx.lineTo(9, 16);
  ctx.lineTo(6, 10);
  ctx.lineTo(11, 10);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();

  ctx.font = '11px "Inter", sans-serif';
  const textWidth = ctx.measureText(name).width;
  ctx.translate(12, 14);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, textWidth + 12, 18);
  ctx.fillStyle = '#0c0d10';
  ctx.fillText(name, 6, 13);
  ctx.restore();
}
