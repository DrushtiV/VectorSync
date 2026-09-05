import { CanvasNode } from '../shared/types';
import { connectorPath } from './connectors';

const imageCache = new Map<string, HTMLImageElement>();

export function drawNode(ctx: CanvasRenderingContext2D, node: CanvasNode, nodes: CanvasNode[] = []): void {
  ctx.save();
  ctx.globalAlpha = node.opacity;
  const cx = node.position.x + node.size.x / 2;
  const cy = node.position.y + node.size.y / 2;
  ctx.translate(cx, cy);
  ctx.rotate((node.rotation * Math.PI) / 180);
  ctx.translate(-cx, -cy);

  ctx.fillStyle = node.fillColor;
  ctx.strokeStyle = node.strokeColor;
  ctx.lineWidth = node.strokeWidth;

  const { x, y } = node.position;
  const { x: w, y: h } = node.size;

  switch (node.type) {
    case 'group':
      break;
    case 'title': {
      ctx.fillStyle = 'rgba(32, 33, 40, 0.72)';
      roundedRectPath(ctx, x, y, w, h, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(124, 212, 253, 0.45)';
      ctx.stroke();
      break;
    }
    case 'rectangle': {
      ctx.beginPath();
      const r = Math.min(node.cornerRadius ?? 6, Math.min(w, h) / 2);
      roundedRectPath(ctx, x, y, w, h, r);
      ctx.fill();
      if (node.strokeWidth > 0) ctx.stroke();
      break;
    }
    case 'pill': {
      ctx.beginPath();
      roundedRectPath(ctx, x, y, w, h, Math.min(w, h) / 2);
      ctx.fill();
      if (node.strokeWidth > 0) ctx.stroke();
      break;
    }
    case 'sticky': {
      ctx.fillStyle = node.fillColor || '#FDE68A';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 4;
      ctx.fillRect(x, y, w, h);
      ctx.shadowColor = 'transparent';
      break;
    }
    case 'ellipse': {
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
      ctx.fill();
      if (node.strokeWidth > 0) ctx.stroke();
      break;
    }
    case 'triangle': {
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      ctx.fill();
      if (node.strokeWidth > 0) ctx.stroke();
      break;
    }
    case 'diamond': {
      polygonPath(ctx, x + w / 2, y + h / 2, Math.min(w, h) / 2, 4, -Math.PI / 2);
      ctx.fill();
      if (node.strokeWidth > 0) ctx.stroke();
      break;
    }
    case 'star':
    case 'polygon': {
      polygonPath(ctx, x + w / 2, y + h / 2, Math.min(w, h) / 2, node.type === 'star' ? 10 : Math.max(3, node.sides ?? 6), -Math.PI / 2, node.type === 'star' ? 0.45 : 1);
      ctx.fill();
      if (node.strokeWidth > 0) ctx.stroke();
      break;
    }
    case 'arrow': {
      ctx.beginPath();
      const headSize = Math.max(8, Math.min(w, h) * 0.25);
      ctx.moveTo(x, y + h / 2);
      ctx.lineTo(x + w - headSize, y + h / 2);
      ctx.lineWidth = Math.max(2, node.strokeWidth || 2);
      ctx.strokeStyle = node.fillColor;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + w, y + h / 2);
      ctx.lineTo(x + w - headSize, y + h / 2 - headSize / 2);
      ctx.lineTo(x + w - headSize, y + h / 2 + headSize / 2);
      ctx.closePath();
      ctx.fillStyle = node.fillColor;
      ctx.fill();
      break;
    }
    case 'text': {
      break;
    }
    case 'image': {
      if (node.imageUrl) {
        let image = imageCache.get(node.imageUrl);
        if (!image) {
          image = new Image();
          image.src = node.imageUrl;
          imageCache.set(node.imageUrl, image);
        }
        if (image.complete && image.naturalWidth > 0) ctx.drawImage(image, x, y, w, h);
      }
      break;
    }
    case 'line': {
      ctx.beginPath();
      ctx.moveTo(x, y + h / 2);
      ctx.lineTo(x + w, y + h / 2);
      ctx.stroke();
      break;
    }
    case 'path': {
      if (node.points && node.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(node.points[0].x, node.points[0].y);
        for (const p of node.points.slice(1)) ctx.lineTo(p.x, p.y);
        ctx.lineWidth = Math.max(1, node.strokeWidth || 2);
        ctx.strokeStyle = node.strokeColor || node.fillColor;
        ctx.stroke();
      }
      break;
    }
    case 'connector': {
      const points = connectorPath(node, nodes);
      if (points.length < 2) break;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.lineWidth = Math.max(1, node.strokeWidth || 2);
      ctx.strokeStyle = node.strokeColor || node.fillColor;
      ctx.stroke();

      const end = points[points.length - 1];
      const previous = points[points.length - 2];
      const angle = Math.atan2(end.y - previous.y, end.x - previous.x);
      const headSize = Math.max(8, node.strokeWidth * 4);
      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(end.x - headSize * Math.cos(angle - Math.PI / 6), end.y - headSize * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(end.x - headSize * Math.cos(angle + Math.PI / 6), end.y - headSize * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fillStyle = node.strokeColor || node.fillColor;
      ctx.fill();
      break;
    }
  }
  drawNodeText(ctx, node);
  ctx.restore();
}

function drawNodeText(ctx: CanvasRenderingContext2D, node: CanvasNode): void {
  if (!node.text || node.type === 'image' || node.type === 'group') return;

  const { x, y } = node.position;
  const { x: width, y: height } = node.size;
  const fontSize = Math.max(6, node.textSize ?? (node.type === 'sticky' ? 18 : node.type === 'text' ? height : 14));
  const position = node.textPosition ?? (node.type === 'sticky' ? 'inside' : 'inside');
  const offset = node.textOffset ?? 0;
  let textX = x + width / 2;
  let textY = y + height / 2;
  let baseline: CanvasTextBaseline = 'middle';

  if (node.type === 'arrow' || node.type === 'line' || node.type === 'connector') {
    textX = x + width / 2;
    if (position === 'above') {
      textY = y - 8 + offset;
      baseline = 'bottom';
    } else if (position === 'below') {
      textY = y + height + 8 + offset;
      baseline = 'top';
    } else {
      textY = y + height / 2 + offset;
    }
  } else if (position === 'above') {
    textY = y - 8 + offset;
    baseline = 'bottom';
  } else if (position === 'below') {
    textY = y + height + 8 + offset;
    baseline = 'top';
  }

  ctx.save();
  ctx.fillStyle = node.textColor ?? (node.type === 'sticky' ? '#6B5520' : node.fillColor);
  ctx.font = `${fontSize}px "${node.textFont ?? 'Inter'}", sans-serif`;
  ctx.textAlign = node.textAlign ?? 'center';
  ctx.textBaseline = baseline;
  const lines = node.text.split('\n');
  const lineHeight = fontSize * 1.2;
  const firstLineY = textY - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => ctx.fillText(line, textX, firstLineY + index * lineHeight));
  ctx.restore();
}

function polygonPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, points: number, startAngle: number, innerRatio = 1): void {
  ctx.beginPath();
  for (let index = 0; index < points; index += 1) {
    const angle = startAngle + (index * Math.PI * 2) / points;
    const pointRadius = index % 2 === 0 ? radius : radius * innerRatio;
    const px = cx + Math.cos(angle) * pointRadius;
    const py = cy + Math.sin(angle) * pointRadius;
    if (index === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawSelectionOutline(
  ctx: CanvasRenderingContext2D,
  node: CanvasNode,
  color: string
): void {
  ctx.save();
  const cx = node.position.x + node.size.x / 2;
  const cy = node.position.y + node.size.y / 2;
  ctx.translate(cx, cy);
  ctx.rotate((node.rotation * Math.PI) / 180);
  ctx.translate(-cx, -cy);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.strokeRect(node.position.x - 2, node.position.y - 2, node.size.x + 4, node.size.y + 4);
  // corner handles
  const handles = [
    { x: node.position.x, y: node.position.y },
    { x: node.position.x + node.size.x, y: node.position.y },
    { x: node.position.x, y: node.position.y + node.size.y },
    { x: node.position.x + node.size.x, y: node.position.y + node.size.y },
  ];
  ctx.fillStyle = '#ffffff';
  for (const h of handles) {
    ctx.beginPath();
    ctx.arc(h.x, h.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

export function hitTest(node: CanvasNode, x: number, y: number): boolean {
  const cx = node.position.x + node.size.x / 2;
  const cy = node.position.y + node.size.y / 2;
  const angle = (-node.rotation * Math.PI) / 180;
  const localX = cx + (x - cx) * Math.cos(angle) - (y - cy) * Math.sin(angle);
  const localY = cy + (x - cx) * Math.sin(angle) + (y - cy) * Math.cos(angle);
  return (
    localX >= node.position.x &&
    localX <= node.position.x + node.size.x &&
    localY >= node.position.y &&
    localY <= node.position.y + node.size.y
  );
}
