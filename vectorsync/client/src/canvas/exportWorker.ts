import { PDFDocument } from 'pdf-lib';
import { CanvasNode, Vector2D } from '../shared/types';
import { connectorPath } from './connectors';

const workerScope = self as any;
type ExportFormat = 'svg' | 'png' | 'pdf';
type ExportRequest = { nodes: CanvasNode[]; format: ExportFormat; scale: number };
type ExportBounds = { minX: number; minY: number; maxX: number; maxY: number };

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character] ?? character));
}

function safeColor(value: string | undefined, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.test(value ?? '') ? value! : fallback;
}

function bounds(nodes: CanvasNode[]): ExportBounds {
  const points: Vector2D[] = [];
  for (const node of nodes) {
    if (node.deleted || node.type === 'group') continue;
    if (node.type === 'connector') {
      points.push(...connectorPath(node, nodes));
      if (node.text && (node.textPosition === 'above' || node.textPosition === 'below')) {
        const extra = (node.textSize ?? 16) * Math.max(1, node.text.split('\n').length) + Math.abs(node.textOffset ?? 0) + 16;
        const connectorPoints = connectorPath(node, nodes);
        const y = node.textPosition === 'above' ? Math.min(...connectorPoints.map((point) => point.y)) - extra : Math.max(...connectorPoints.map((point) => point.y)) + extra;
        points.push({ x: Math.min(...connectorPoints.map((point) => point.x)), y });
      }
      continue;
    }
    const centerX = node.position.x + node.size.x / 2;
    const centerY = node.position.y + node.size.y / 2;
    const angle = (node.rotation * Math.PI) / 180;
    const corners = [
      { x: node.position.x, y: node.position.y },
      { x: node.position.x + node.size.x, y: node.position.y },
      { x: node.position.x, y: node.position.y + node.size.y },
      { x: node.position.x + node.size.x, y: node.position.y + node.size.y },
    ];
    points.push(...corners.map((corner) => ({
      x: centerX + (corner.x - centerX) * Math.cos(angle) - (corner.y - centerY) * Math.sin(angle),
      y: centerY + (corner.x - centerX) * Math.sin(angle) + (corner.y - centerY) * Math.cos(angle),
    })));
    if (node.text && (node.textPosition === 'above' || node.textPosition === 'below')) {
      const extra = (node.textSize ?? 16) * Math.max(1, node.text.split('\n').length) + Math.abs(node.textOffset ?? 0) + 16;
      const rotatedTop = Math.min(...corners.map((corner) => centerY + (corner.x - centerX) * Math.sin(angle) + (corner.y - centerY) * Math.cos(angle)));
      const rotatedBottom = Math.max(...corners.map((corner) => centerY + (corner.x - centerX) * Math.sin(angle) + (corner.y - centerY) * Math.cos(angle)));
      points.push({ x: centerX, y: node.textPosition === 'above' ? rotatedTop - extra : rotatedBottom + extra });
    }
  }
  if (!points.length) return { minX: 0, minY: 0, maxX: 800, maxY: 600 };
  const padding = 24;
  return {
    minX: Math.min(...points.map((point) => point.x)) - padding,
    minY: Math.min(...points.map((point) => point.y)) - padding,
    maxX: Math.max(...points.map((point) => point.x)) + padding,
    maxY: Math.max(...points.map((point) => point.y)) + padding,
  };
}

function polygonPoints(node: CanvasNode): string {
  const count = node.type === 'star' ? (node.sides ?? 5) * 2 : node.sides ?? 6;
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
    const radius = node.type === 'star' && index % 2 ? 0.45 : 1;
    return `${node.size.x / 2 + Math.cos(angle) * node.size.x / 2 * radius},${node.size.y / 2 + Math.sin(angle) * node.size.y / 2 * radius}`;
  }).join(' ');
}

function textSvg(node: CanvasNode, absolute: boolean): string {
  if (!node.text || node.type === 'image' || node.type === 'group') return '';
  const size = node.textSize ?? (node.type === 'title' ? 32 : node.type === 'text' ? node.size.y : 14);
  const position = node.textPosition ?? 'inside';
  const offset = node.textOffset ?? 0;
  let x = (absolute ? node.position.x : 0) + node.size.x / 2;
  let y = (absolute ? node.position.y : 0) + node.size.y / 2 + offset;
  let baseline = 'middle';
  if (position === 'above') { y = (absolute ? node.position.y : 0) - 8 + offset; baseline = 'auto'; }
  if (position === 'below') { y = (absolute ? node.position.y : 0) + node.size.y + 8 + offset; baseline = 'hanging'; }
  if (node.type === 'text') { x = absolute ? node.position.x : 0; y = (absolute ? node.position.y : 0) + size; baseline = 'alphabetic'; }
  const anchor = node.textAlign ?? (node.type === 'text' ? 'left' : 'center');
  const lines = node.text.split('\n');
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="${baseline}" fill="${safeColor(node.textColor, safeColor(node.fillColor, '#ECEEF2'))}" font-family="${escapeXml(node.textFont ?? 'Inter')}" font-size="${size}">${lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : size * 1.2}">${escapeXml(line)}</tspan>`).join('')}</text>`;
}

function nodeToSvg(node: CanvasNode, nodes: CanvasNode[]): string {
  const transform = `translate(${node.position.x} ${node.position.y}) rotate(${node.rotation} ${node.size.x / 2} ${node.size.y / 2})`;
  const fill = safeColor(node.fillColor, '#7CD4FD');
  const stroke = safeColor(node.strokeColor, '#1B1C22');
  const style = `fill:${fill};stroke:${stroke};stroke-width:${node.strokeWidth};opacity:${node.opacity}`;
  let shape = '';
  if (node.type === 'title') shape = `<rect x="0" y="0" width="${node.size.x}" height="${node.size.y}" rx="8" style="fill:#202128;stroke:#7CD4FD;stroke-opacity:.45;stroke-width:1"/>`;
  else if (node.type === 'rectangle' || node.type === 'pill' || node.type === 'sticky') shape = `<rect x="0" y="0" width="${node.size.x}" height="${node.size.y}" rx="${node.type === 'pill' ? Math.min(node.size.x, node.size.y) / 2 : node.cornerRadius ?? (node.type === 'sticky' ? 2 : 6)}" style="${style}"/>`;
  else if (node.type === 'ellipse') shape = `<ellipse cx="${node.size.x / 2}" cy="${node.size.y / 2}" rx="${Math.abs(node.size.x / 2)}" ry="${Math.abs(node.size.y / 2)}" style="${style}"/>`;
  else if (node.type === 'triangle') shape = `<path d="M ${node.size.x / 2} 0 L ${node.size.x} ${node.size.y} L 0 ${node.size.y} Z" style="${style}"/>`;
  else if (node.type === 'diamond') shape = `<path d="M ${node.size.x / 2} 0 L ${node.size.x} ${node.size.y / 2} L ${node.size.x / 2} ${node.size.y} L 0 ${node.size.y / 2} Z" style="${style}"/>`;
  else if (node.type === 'polygon' || node.type === 'star') shape = `<polygon points="${polygonPoints(node)}" style="${style}"/>`;
  else if (node.type === 'line') shape = `<path d="M 0 ${node.size.y / 2} L ${node.size.x} ${node.size.y / 2}" fill="none" style="${style}"/>`;
  else if (node.type === 'arrow') shape = `<path d="M 0 ${node.size.y / 2} H ${node.size.x} M ${node.size.x} ${node.size.y / 2} l -${node.size.y / 4} -${node.size.y / 4} M ${node.size.x} ${node.size.y / 2} l -${node.size.y / 4} ${node.size.y / 4}" fill="none" style="${style}"/>`;
  else if (node.type === 'path' && node.points?.length) shape = `<path d="M ${node.points.map((point) => `${point.x} ${point.y}`).join(' L ')}" fill="none" style="${style}"/>`;
  else if (node.type === 'image' && node.imageUrl) shape = `<image href="${escapeXml(node.imageUrl)}" x="0" y="0" width="${node.size.x}" height="${node.size.y}" opacity="${node.opacity}" preserveAspectRatio="none"/>`;
  else if (node.type === 'connector') {
    const points = connectorPath(node, nodes);
    const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
    shape = `<path d="${path}" fill="none" style="stroke:${stroke};stroke-width:${Math.max(1, node.strokeWidth)}"/>`;
  }
  const isAbsolute = node.type === 'connector' || node.type === 'path';
  return `<g transform="${isAbsolute ? '' : transform}">${shape}${textSvg(node, isAbsolute)}</g>`;
}

function svgFor(nodes: CanvasNode[], scale: number): string {
  const box = bounds(nodes);
  const width = Math.max(1, box.maxX - box.minX);
  const height = Math.max(1, box.maxY - box.minY);
  const elements = nodes.filter((node) => !node.deleted && node.type !== 'group').sort((a, b) => a.zIndex - b.zIndex).map((node) => nodeToSvg(node, nodes)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.minX} ${box.minY} ${width} ${height}" width="${width * scale}" height="${height * scale}"><rect x="${box.minX}" y="${box.minY}" width="${width}" height="${height}" fill="#15161c"/>${elements}</svg>`;
}

async function rasterize(svg: string, width: number, height: number): Promise<Blob> {
  const image = await createImageBitmap(new Blob([svg], { type: 'image/svg+xml' }));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create export canvas');
  context.drawImage(image, 0, 0, width, height);
  return canvas.convertToBlob({ type: 'image/png' });
}

async function pdfFromPng(png: Blob, width: number, height: number): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([width, height]);
  const image = await pdf.embedPng(await png.arrayBuffer());
  page.drawImage(image, { x: 0, y: 0, width, height });
  const bytes = await pdf.save();
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: 'application/pdf' });
}

workerScope.onmessage = async (event: MessageEvent<ExportRequest>) => {
  try {
    const { nodes, format, scale } = event.data;
    const box = bounds(nodes);
    const width = Math.max(1, Math.ceil((box.maxX - box.minX) * scale));
    const height = Math.max(1, Math.ceil((box.maxY - box.minY) * scale));
    const svg = svgFor(nodes, scale);
    if (format === 'svg') {
      workerScope.postMessage({ result: new Blob([svg], { type: 'image/svg+xml' }) });
      return;
    }
    if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
      workerScope.postMessage({ error: 'PNG and PDF export require OffscreenCanvas support in this browser.' });
      return;
    }
    const png = await rasterize(svg, width, height);
    workerScope.postMessage({ result: format === 'png' ? png : await pdfFromPng(png, width, height) });
  } catch (error) {
    workerScope.postMessage({ error: error instanceof Error ? error.message : 'Export failed' });
  }
};
