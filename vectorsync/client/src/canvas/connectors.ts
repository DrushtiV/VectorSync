import { CanvasNode, Vector2D } from '../shared/types';

export interface NodeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function calculateOrthoPath(source: NodeBounds, target: NodeBounds): Vector2D[] {
  const start = { x: source.x + source.width / 2, y: source.y + source.height };
  const end = { x: target.x + target.width / 2, y: target.y };
  const midY = start.y + (end.y - start.y) / 2;
  return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
}

export function connectorPath(node: CanvasNode, nodes: CanvasNode[]): Vector2D[] {
  const source = nodes.find((candidate) => candidate.id === node.sourceId);
  const target = nodes.find((candidate) => candidate.id === node.targetId);
  if (!source || !target) {
    return [
      { x: node.position.x, y: node.position.y },
      { x: node.position.x + node.size.x, y: node.position.y + node.size.y },
    ];
  }

  const sourceBounds = { x: source.position.x, y: source.position.y, width: source.size.x, height: source.size.y };
  const targetBounds = { x: target.position.x, y: target.position.y, width: target.size.x, height: target.size.y };
  if (node.pathStyle === 'ortho') return calculateOrthoPath(sourceBounds, targetBounds);
  return [
    { x: source.position.x + source.size.x / 2, y: source.position.y + source.size.y / 2 },
    { x: target.position.x + target.size.x / 2, y: target.position.y + target.size.y / 2 },
  ];
}

export function pathBounds(points: Vector2D[]) {
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}
